const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { auth, optionalAuth, adminAuth } = require('../middleware/auth');
const { sanitizeString, sanitizeStringArray } = require('../utils/sanitize');

const router = express.Router();

/* ============================================================
 * 预编译语句（模块级复用，避免每次请求重复 prepare）
 * ============================================================ */

/* 我的档案相关 */
const stmtUserNick = db.prepare('SELECT nickname FROM users WHERE id = ?');
const stmtInsertProfile = db.prepare('INSERT OR IGNORE INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)');
const stmtMyProfile = db.prepare('SELECT p.*, u.avatar FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?');
const stmtProfileExists = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
const stmtUpdateProfile = db.prepare(`
  UPDATE profiles
  SET nickname = ?, intro = ?, offers = ?, keywords = ?, needs = ?, wechat = ?, city = ?, updated_at = ?
  WHERE user_id = ?
`);
const stmtUpdateUserNick = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');
const stmtDeleteProfile = db.prepare('DELETE FROM profiles WHERE user_id = ?');
const stmtDeleteProfileByPid = db.prepare('DELETE FROM profiles WHERE id = ?');
const stmtCountProfiles = db.prepare('SELECT COUNT(*) as count FROM profiles');

/* 收藏相关 */
const stmtAddFavorite = db.prepare('INSERT OR IGNORE INTO favorites (user_id, profile_id) VALUES (?, ?)');
const stmtRemoveFavorite = db.prepare('DELETE FROM favorites WHERE user_id = ? AND profile_id = ?');
const stmtCheckFavorite = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND profile_id = ?');
const stmtCountFavorites = db.prepare('SELECT COUNT(*) as count FROM favorites WHERE profile_id = ?');

/* ============================================================
 * 转义 LIKE 通配符 % 和 _，避免用户输入干扰模式匹配
 * @param {string} s - 用户输入的搜索词
 * @returns {string}  - 转义后的安全字符串
 */
const LIKE_ESCAPER = /[%_\\]/g;
function escapeLike(s) {
  return s.replace(LIKE_ESCAPER, '\\$&');
}

/* ============================================================
 * 给档案列表附加 is_favorited 字段（登录用户视角）
 *  批量查询以避免 N+1 问题
 * @param {Array} rows  - 档案行列表
 * @param {string|null} userId - 当前登录用户 ID
 * @returns {Array} - 附加了 is_favorited 字段的档案列表
 */
function attachFavoriteFlag(rows, userId) {
  if (!userId) return rows.map(r => ({ ...r, is_favorited: false }));
  /* 批量查询当前用户收藏了哪些 profile，避免 N+1 */
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return rows;
  const placeholders = ids.map(() => '?').join(',');
  const favRows = db.prepare(
    `SELECT profile_id FROM favorites WHERE user_id = ? AND profile_id IN (${placeholders})`
  ).all(userId, ...ids);
  const favSet = new Set(favRows.map(r => r.profile_id));
  return rows.map(r => ({ ...r, is_favorited: favSet.has(r.id) }));
}

/* 举报相关 */
const REPORT_REASONS = ['垃圾广告', '虚假信息', '违法违规', '骚扰辱骂', '其他'];
const stmtCheckReport = db.prepare('SELECT 1 FROM reports WHERE reporter_id = ? AND profile_id = ?');
const stmtInsertReport = db.prepare('INSERT INTO reports (id, reporter_id, profile_id, reason, detail) VALUES (?, ?, ?, ?, ?)');
const stmtGetProfileOwner = db.prepare('SELECT user_id FROM profiles WHERE id = ?');

/* ============================================
 *  GET /api/profiles      浏览档案（公开）
 *  Query:
 *   - q: 搜索关键词（FTS5 或 LIKE 降级）
 *   - page: 页码（默认 1）
 *   - size: 每页条数（默认 20，最大 50）
 *   - sort: 'latest'|'popular'（默认 latest）
 *   - city: 城市过滤（精确匹配）
 *  optionalAuth：登录用户会看到 is_favorited 字段
 * ============================================ */
/**
 * @route GET /api/profiles
 * @param {string}  [req.query.q]       - 搜索关键词
 * @param {number}  [req.query.page]     - 页码，默认 1
 * @param {number}  [req.query.size]     - 每页条数，默认 20，最大 50
 * @param {string}  [req.query.sort]     - 排序方式：latest|popular
 * @param {string}  [req.query.city]     - 城市过滤（精确匹配）
 * @returns {{ items: Array, total: number, page: number, size: number }}
 */
router.get('/', optionalAuth, (req, res) => {
  const { q, page = 1, size = 20, sort = 'latest', city } = req.query;
  const limit = Math.min(Number(size) || 20, 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const userId = req.userId || null;
  const orderByPopular = sort === 'popular';
  /* 城市精确过滤（为空时不过滤）*/
  const cityFilter = city && city.trim() ? city.trim() : null;

  let rows, total;

  /* 城市过滤子句（注意：FTS5 分支无法直接用 city 过滤，需在 LIKE 分支处理）*/
  const cityClause = cityFilter ? ' AND p.city = ?' : '';
  const cityParams = cityFilter ? [cityFilter] : [];

  if (q && q.trim()) {
    const term = q.trim();
    /* 先尝试 FTS5；FTS5 对中文连续字符分词有限，可能返回 0 结果 */
    let ftsOk = false;
    try {
      /* FTS5 不支持 city 精确过滤，降级到 LIKE 分支处理城市过滤 */
      if (!cityFilter) {
        const ftsTotal = db.prepare('SELECT COUNT(*) as total FROM profiles_fts WHERE profiles_fts MATCH ?').get(term).total;
        if (ftsTotal > 0) {
          total = ftsTotal;
          if (orderByPopular) {
            rows = db.prepare(`
              SELECT p.*, u.avatar, COUNT(f2.profile_id) AS fav_count
              FROM profiles_fts fts
              JOIN profiles p ON p.rowid = fts.rowid
              JOIN users u ON p.user_id = u.id
              LEFT JOIN favorites f2 ON f2.profile_id = p.id
              WHERE profiles_fts MATCH ?
              GROUP BY p.id
              ORDER BY fav_count DESC, p.updated_at DESC
              LIMIT ? OFFSET ?
            `).all(term, limit, offset);
          } else {
            rows = db.prepare(`
              SELECT p.*, u.avatar, 0 AS fav_count
              FROM profiles_fts fts
              JOIN profiles p ON p.rowid = fts.rowid
              JOIN users u ON p.user_id = u.id
              WHERE profiles_fts MATCH ?
              ORDER BY rank
              LIMIT ? OFFSET ?
            `).all(term, limit, offset);
          }
          ftsOk = true;
        }
      }
    } catch (e) {
      /* FTS5 对特殊字符（如 *、"、:、^）会抛错，忽略走 LIKE */
    }
    /* FTS5 未命中或不可用或有城市过滤时，降级到 LIKE（中文子串匹配更可靠）*/
    if (!ftsOk) {
      const keyword = '%' + escapeLike(term) + '%';
      const likeWhere = `(p.nickname LIKE ? OR p.intro LIKE ? OR p.keywords LIKE ? OR p.offers LIKE ? OR p.needs LIKE ?)${cityClause}`;
      const likeParams = [keyword, keyword, keyword, keyword, keyword, ...cityParams];
      total = db.prepare(`SELECT COUNT(*) as total FROM profiles p WHERE ${likeWhere}`).get(...likeParams).total;
      if (orderByPopular) {
        rows = db.prepare(`
          SELECT p.*, u.avatar, COUNT(f2.profile_id) AS fav_count
          FROM profiles p JOIN users u ON p.user_id = u.id
          LEFT JOIN favorites f2 ON f2.profile_id = p.id
          WHERE ${likeWhere}
          GROUP BY p.id
          ORDER BY fav_count DESC, p.updated_at DESC
          LIMIT ? OFFSET ?
        `).all(...likeParams, limit, offset);
      } else {
        rows = db.prepare(`
          SELECT p.*, u.avatar, 0 AS fav_count
          FROM profiles p JOIN users u ON p.user_id = u.id
          WHERE ${likeWhere}
          ORDER BY p.updated_at DESC
          LIMIT ? OFFSET ?
        `).all(...likeParams, limit, offset);
      }
    }
  } else {
    /* 无搜索词 */
    const baseWhere = cityFilter ? 'WHERE p.city = ?' : '';
    if (cityFilter) {
      total = db.prepare(`SELECT COUNT(*) as total FROM profiles p ${baseWhere}`).get(cityFilter).total;
    } else {
      total = stmtCountProfiles.get().count;
    }
    if (orderByPopular) {
      rows = db.prepare(`
        SELECT p.*, u.avatar, COUNT(f2.profile_id) AS fav_count
        FROM profiles p JOIN users u ON p.user_id = u.id
        LEFT JOIN favorites f2 ON f2.profile_id = p.id
        ${baseWhere}
        GROUP BY p.id
        ORDER BY fav_count DESC, p.updated_at DESC
        LIMIT ? OFFSET ?
      `).all(...cityParams, limit, offset);
    } else {
      rows = db.prepare(`
        SELECT p.*, u.avatar, 0 AS fav_count
        FROM profiles p JOIN users u ON p.user_id = u.id
        ${baseWhere}
        ORDER BY p.updated_at DESC
        LIMIT ? OFFSET ?
      `).all(...cityParams, limit, offset);
    }
  }

  /* 解析 JSON 字段 + 附加收藏标记 + 微信号隐私保护 */
  const profiles = attachFavoriteFlag(
    rows.map(p => ({
      ...p,
      offers: safeJson(p.offers, []),
      keywords: safeJson(p.keywords, []),
      needs: safeJson(p.needs, []),
      /* 未登录用户不可见微信号 */
      wechat: userId ? p.wechat : '登录后可见',
    })),
    userId
  );

  res.json({ profiles, total, page: Number(page), size: limit });
});

/* ============================================
 *  GET /api/profiles/mine    获取我的档案
 *  自动创建空档案（如果不存在）
 *  auth：需登录
 * ============================================ */

/**
 * @route GET /api/profiles/mine
 * @returns {object} profile - 包含 offers/keywords/needs 已 JSON.parse
 */
router.get('/mine', auth, (req, res) => {
  const user = stmtUserNick.get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const pid = 'p_' + crypto.randomUUID().slice(0, 12);
  stmtInsertProfile.run(pid, req.userId, user.nickname);

  let profile = stmtMyProfile.get(req.userId);

  if (!profile) {
    return res.status(500).json({ error: '档案创建失败，请重试' });
  }

  profile = {
    ...profile,
    offers: safeJson(profile.offers, []),
    keywords: safeJson(profile.keywords, []),
    needs: safeJson(profile.needs, []),
  };

  res.json(profile);
});

/* ============================================
 *  PUT /api/profiles/mine    更新我的档案
 *  如不存在则自动创建
 *  字段超限或类型错误时返回 400
 * ============================================ */

/**
 * @route PUT /api/profiles/mine
 * @param {string}  req.body.nickname  - 昵称（≤20）
 * @param {string}  req.body.intro     - 介绍（≤200）
 * @param {string}  req.body.wechat    - 微信号（≤50）
 * @param {string}  req.body.city      - 城市（≤20）
 * @param {string[]} req.body.offers   - 能力列表（≤20 条，每条≤100）
 * @param {string[]} req.body.keywords - 标签列表（≤20 条，每条≤30）
 * @param {string[]} req.body.needs    - 需求列表（≤20 条，每条≤100）
 * @returns {object} profile
 */
router.put('/mine', auth, (req, res) => {
  const body = req.body;

  /* 类型校验：在 sanitize 之前拒绝非法类型 */
  if (body.offers && !Array.isArray(body.offers)) return res.status(400).json({ error: 'offers 必须是数组' });
  if (body.keywords && !Array.isArray(body.keywords)) return res.status(400).json({ error: 'keywords 必须是数组' });
  if (body.needs && !Array.isArray(body.needs)) return res.status(400).json({ error: 'needs 必须是数组' });

  const nickname = sanitizeString(body.nickname, 20);
  const intro    = sanitizeString(body.intro, 200);
  const wechat   = sanitizeString(body.wechat, 50);
  const city     = sanitizeString(body.city, 20);
  const offers   = sanitizeStringArray(body.offers, 100, 20);
  const keywords = sanitizeStringArray(body.keywords, 30, 20);
  const needs    = sanitizeStringArray(body.needs, 100, 20);

  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: '昵称不能为空' });
  }

  if (nickname.trim().length > 20) return res.status(400).json({ error: '昵称最多 20 个字符' });
  if (intro.length > 200) return res.status(400).json({ error: '介绍最多 200 个字符' });
  if (wechat.length > 50) return res.status(400).json({ error: '微信号最多 50 个字符' });
  if (city.length > 20) return res.status(400).json({ error: '城市最多 20 个字符' });

  const MAX_ITEMS = 20, MAX_ITEM_LEN = 100;
  if (offers.length > MAX_ITEMS) return res.status(400).json({ error: `最多填写 ${MAX_ITEMS} 条能力` });
  if (keywords.length > MAX_ITEMS) return res.status(400).json({ error: `最多填写 ${MAX_ITEMS} 个标签` });
  if (needs.length > MAX_ITEMS) return res.status(400).json({ error: `最多填写 ${MAX_ITEMS} 条需求` });
  if (offers.some(o => o.length > MAX_ITEM_LEN)) {
    return res.status(400).json({ error: `每条能力最多 ${MAX_ITEM_LEN} 个字符` });
  }
  if (keywords.some(k => k.length > 30)) {
    return res.status(400).json({ error: `每个标签最多 30 个字符` });
  }
  if (needs.some(n => n.length > MAX_ITEM_LEN)) {
    return res.status(400).json({ error: `每条需求最多 ${MAX_ITEM_LEN} 个字符` });
  }

  const now = Date.now();
  const offersJson   = JSON.stringify(offers);
  const keywordsJson = JSON.stringify(keywords);
  const needsJson    = JSON.stringify(needs);

  const existing = stmtProfileExists.get(req.userId);
  if (!existing) {
    return res.status(404).json({ error: '请先创建档案' });
  }

  db.transaction(() => {
    stmtUpdateProfile.run(nickname.trim(), (intro || '').trim(), offersJson, keywordsJson, needsJson, (wechat || '').trim(), (city || '').trim(), now, req.userId);
    stmtUpdateUserNick.run(nickname.trim(), req.userId);
  })();

  /* 档案变更，使统计缓存失效 */
  statsCache.data = null;

  const profile = stmtMyProfile.get(req.userId);

  res.json({
    ...profile,
    offers: safeJson(profile.offers, []),
    keywords: safeJson(profile.keywords, []),
    needs: safeJson(profile.needs, []),
  });
});

/**
 * DELETE /api/profiles/mine
 * 删除当前用户的档案
 */
router.delete('/mine', auth, (req, res) => {
  /* 删除前先查询，确保存在 */
  const existing = stmtProfileExists.get(req.userId);
  if (!existing) {
    return res.status(404).json({ error: '档案不存在' });
  }

  const result = stmtDeleteProfile.run(req.userId);
  if (result.changes === 0) {
    return res.status(500).json({ error: '删除失败，请重试' });
  }

  /* 档案删除，使统计缓存失效 */
  statsCache.data = null;

  res.json({ success: true });
});

/**
 * POST /api/profiles/:id/favorite
 * 收藏指定档案
 * @param {string} id - 档案 ID（路径参数）
 */
router.post('/:id/favorite', auth, (req, res) => {
  const { id } = req.params;
  /* 确认档案存在 */
  const exists = db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: '档案不存在' });
  stmtAddFavorite.run(req.userId, id);
  res.json({ success: true, favorited: true });
});

/**
 * DELETE /api/profiles/:id/favorite
 * 取消收藏指定档案
 * @param {string} id - 档案 ID（路径参数）
 */
router.delete('/:id/favorite', auth, (req, res) => {
  const { id } = req.params;
  stmtRemoveFavorite.run(req.userId, id);
  res.json({ success: true, favorited: false });
});

/**
 * GET /api/profiles/favorites
 * 获取当前用户的收藏列表（分页）
 * @query {number} [page=1]
 * @query {number} [size=20]
 */
router.get('/favorites', auth, (req, res) => {
  const { page = 1, size = 20 } = req.query;
  const limit = Math.min(Number(size) || 20, 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const total = db.prepare(`
    SELECT COUNT(*) as total FROM favorites f JOIN profiles p ON p.id = f.profile_id WHERE f.user_id = ?
  `).get(req.userId).total;

  const rows = db.prepare(`
    SELECT p.*, u.avatar, 1 AS fav_count, 1 AS is_favorited
    FROM favorites f
    JOIN profiles p ON p.id = f.profile_id
    JOIN users u ON p.user_id = u.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, limit, offset);

  const profiles = rows.map(p => ({
    ...p,
    offers: safeJson(p.offers, []),
    keywords: safeJson(p.keywords, []),
    needs: safeJson(p.needs, []),
  }));

  res.json({ profiles, total, page: Number(page), size: limit });
});

/* ============================================
 *  举报相关 API
 * ============================================ */

/**
 * POST /api/profiles/:id/report
 * 举报指定档案
 * @param {string} id - 档案 ID（路径参数）
 * @body {string} reason - 举报原因（必须是 REPORT_REASONS 之一）
 * @body {string} [detail] - 补充说明（最多 500 字）
 */
router.post('/:id/report', auth, (req, res) => {
  const { id } = req.params;
  const { reason, detail } = req.body;

  /* 校验举报原因 */
  if (!reason || !REPORT_REASONS.includes(reason)) {
    return res.status(400).json({ error: '请选择有效的举报原因' });
  }
  if (detail && typeof detail === 'string' && detail.length > 500) {
    return res.status(400).json({ error: '补充说明最多 500 字' });
  }

  /* 确认档案存在 */
  const owner = stmtGetProfileOwner.get(id);
  if (!owner) return res.status(404).json({ error: '档案不存在' });

  /* 不能举报自己 */
  if (owner.user_id === req.userId) {
    return res.status(400).json({ error: '不能举报自己' });
  }

  /* 同一用户对同一档案只能举报一次 */
  if (stmtCheckReport.get(req.userId, id)) {
    return res.status(409).json({ error: '你已举报过该档案' });
  }

  const rid = 'r_' + crypto.randomUUID().slice(0, 12);
  stmtInsertReport.run(rid, req.userId, id, reason, (detail || '').trim());
  res.json({ success: true });
});

/**
 * GET /api/profiles/reports
 * 管理员查看举报列表
 * @query {string} [status] - 过滤状态：pending|dismissed|removed
 */
router.get('/reports', auth, adminAuth, (req, res) => {
  const { status } = req.query;
  const validStatus = ['pending', 'dismissed', 'removed'];

  let sql = `
    SELECT r.id, r.reason, r.detail, r.status, r.created_at,
           p.id AS profile_id, p.nickname AS profile_nickname,
           u.username AS reporter_username
    FROM reports r
    JOIN profiles p ON p.id = r.profile_id
    JOIN users u ON u.id = r.reporter_id
  `;
  const params = [];
  if (status && validStatus.includes(status)) {
    sql += ' WHERE r.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY r.created_at DESC LIMIT 100';

  const reports = db.prepare(sql).all(...params);
  res.json({ reports });
});

/**
 * PATCH /api/profiles/reports/:id
 * 管理员处理举报（驳回或删除档案）
 * @param {string} id - 举报记录 ID
 * @body {string} status - 处理结果：dismissed|removed
 */
router.patch('/reports/:id', auth, adminAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['dismissed', 'removed'].includes(status)) {
    return res.status(400).json({ error: '无效的处理状态' });
  }

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!report) return res.status(404).json({ error: '举报记录不存在' });

  db.transaction(() => {
    db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, id);
    /* status=removed：同时删除被举报的档案 */
    if (status === 'removed') {
      stmtDeleteProfileByPid.run(report.profile_id);
    }
  })();

  res.json({ success: true, status });
});

/**
 * GET /api/profiles/stats
 * 获取平台统计信息（含 60 秒内存缓存）
 * @returns {object} total, topOffers, topKeywords, recentTrend
 */
let statsCache = { data: null, timestamp: 0 };

router.get('/stats', (req, res) => {
  const now = Date.now();
  if (statsCache.data && now - statsCache.timestamp < 60 * 1000) {
    return res.json(statsCache.data);
  }

  const total = stmtCountProfiles.get().count;

  /* 热门能力 TOP10：解析所有 offers JSON，聚合统计 */
  const offersRows = db.prepare("SELECT offers FROM profiles WHERE offers != '[]'").all();
  const offerCounts = new Map();
  for (const r of offersRows) {
    const items = safeJson(r.offers, []);
    for (const item of items) {
      const key = String(item).trim();
      if (key) offerCounts.set(key, (offerCounts.get(key) || 0) + 1);
    }
  }
  const topOffers = [...offerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  /* 热门关键词 TOP10 */
  const kwRows = db.prepare("SELECT keywords FROM profiles WHERE keywords != '[]'").all();
  const kwCounts = new Map();
  for (const r of kwRows) {
    const items = safeJson(r.keywords, []);
    for (const item of items) {
      const key = String(item).trim();
      if (key) kwCounts.set(key, (kwCounts.get(key) || 0) + 1);
    }
  }
  const topKeywords = [...kwCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  /* 近 7 天每日新增档案数 */
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const trendRows = db.prepare(`
    SELECT created_at FROM profiles WHERE created_at >= ?
  `).all(sevenDaysAgo);
  /* 按日期分组（本地时区）*/
  const dayCounts = new Array(7).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const r of trendRows) {
    const d = new Date(r.created_at);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / (24 * 60 * 60 * 1000));
    if (diff >= 0 && diff < 7) {
      dayCounts[6 - diff] += 1;
    }
  }
  /* 生成日期标签（近 7 天，最早到最近）*/
  const recentTrend = dayCounts.map((count, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { date: (d.getMonth() + 1) + '/' + d.getDate(), count };
  });

  const data = { total, topOffers, topKeywords, recentTrend };
  statsCache = { data, timestamp: now };
  res.json(data);
});

function safeJson(str, fallback) {
  if (str == null) return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed != null ? parsed : fallback;
  } catch { return fallback; }
}

module.exports = router;
