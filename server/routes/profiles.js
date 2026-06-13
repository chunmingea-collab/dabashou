const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/* ============================================
 *  GET /api/profiles      浏览档案（公开）
 *  支持 ?q= 关键字搜索  &page= &size=
 * ============================================ */

router.get('/', optionalAuth, (req, res) => {
  const { q, page = 1, size = 20 } = req.query;
  const limit = Math.min(Number(size) || 20, 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  let sql, countSql, params;

  if (q && q.trim()) {
    /* 转义 LIKE 通配符，防止 % 匹配全部、_ 匹配任意单字符 */
    const escaped = q.trim().replace(/[%_]/g, '\\$&');
    const keyword = `%${escaped}%`;
    sql = `
      SELECT p.*, u.avatar
      FROM profiles p JOIN users u ON p.user_id = u.id
      WHERE p.nickname LIKE ? OR p.intro LIKE ? OR p.keywords LIKE ? OR p.offers LIKE ? OR p.needs LIKE ?
      ORDER BY p.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    countSql = `
      SELECT COUNT(*) as total FROM profiles p
      WHERE p.nickname LIKE ? OR p.intro LIKE ? OR p.keywords LIKE ? OR p.offers LIKE ? OR p.needs LIKE ?
    `;
    params = [keyword, keyword, keyword, keyword, keyword];
  } else {
    sql = `
      SELECT p.*, u.avatar
      FROM profiles p JOIN users u ON p.user_id = u.id
      ORDER BY p.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    countSql = `SELECT COUNT(*) as total FROM profiles`;
    params = [];
  }

  const total = db.prepare(countSql).get(...params).total;
  const list = db.prepare(sql).all(...params, limit, offset);

  /* 解析 JSON 字段 */
  const profiles = list.map(p => ({
    ...p,
    offers: safeJson(p.offers, []),
    keywords: safeJson(p.keywords, []),
    needs: safeJson(p.needs, []),
  }));

  res.json({ profiles, total, page: Number(page), size: limit });
});

/* ============================================
 *  GET /api/profiles/mine    我的档案
 * ============================================ */

router.get('/mine', auth, (req, res) => {
  /* 如果用户行不存在则报错 */
  const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  /* INSERT OR IGNORE 原子处理并发请求的竞态条件 */
  const pid = 'p_' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT OR IGNORE INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)').run(pid, req.userId, user.nickname);

  let profile = db.prepare('SELECT p.*, u.avatar FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?').get(req.userId);

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
 * ============================================ */

router.put('/mine', auth, (req, res) => {
  const { nickname, intro, offers, keywords, needs, wechat } = req.body;

  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: '昵称不能为空' });
  }

  /* 长度校验 */
  if (nickname.trim().length > 20) return res.status(400).json({ error: '昵称最多 20 个字符' });
  if (intro && intro.trim().length > 200) return res.status(400).json({ error: '介绍最多 200 个字符' });
  if (wechat && wechat.trim().length > 50) return res.status(400).json({ error: '微信号最多 50 个字符' });

  /* 数组数量和每项长度校验 */
  const MAX_ITEMS = 20, MAX_ITEM_LEN = 100;
  if (offers && !Array.isArray(offers)) return res.status(400).json({ error: 'offers 必须是数组' });
  if (keywords && !Array.isArray(keywords)) return res.status(400).json({ error: 'keywords 必须是数组' });
  if (needs && !Array.isArray(needs)) return res.status(400).json({ error: 'needs 必须是数组' });
  if (offers && offers.length > MAX_ITEMS) return res.status(400).json({ error: `最多填写 ${MAX_ITEMS} 条能力` });
  if (keywords && keywords.length > MAX_ITEMS) return res.status(400).json({ error: `最多填写 ${MAX_ITEMS} 个标签` });
  if (needs && needs.length > MAX_ITEMS) return res.status(400).json({ error: `最多填写 ${MAX_ITEMS} 条需求` });
  if (offers && offers.some(o => typeof o !== 'string' || o.length > MAX_ITEM_LEN))
    return res.status(400).json({ error: `每条能力最多 ${MAX_ITEM_LEN} 个字符` });
  if (keywords && keywords.some(k => typeof k !== 'string' || k.length > 30))
    return res.status(400).json({ error: `每个标签最多 30 个字符` });
  if (needs && needs.some(n => typeof n !== 'string' || n.length > MAX_ITEM_LEN))
    return res.status(400).json({ error: `每条需求最多 ${MAX_ITEM_LEN} 个字符` });

  const now = Date.now();
  const offersJson = JSON.stringify(Array.isArray(offers) ? offers.filter(v => typeof v === 'string' && v.trim()) : []);
  const keywordsJson = JSON.stringify(Array.isArray(keywords) ? keywords.filter(v => typeof v === 'string' && v.trim()) : []);
  const needsJson = JSON.stringify(Array.isArray(needs) ? needs.filter(v => typeof v === 'string' && v.trim()) : []);

  /* 确认档案存在 */
  const existing = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.userId);
  if (!existing) {
    return res.status(404).json({ error: '请先创建档案' });
  }

  /* 事务：原子更新 profiles + users 昵称同步 */
  const updateProfiles = db.prepare(`
    UPDATE profiles
    SET nickname = ?, intro = ?, offers = ?, keywords = ?, needs = ?, wechat = ?, updated_at = ?
    WHERE user_id = ?
  `);
  const updateUserNick = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');

  db.transaction(() => {
    updateProfiles.run(nickname.trim(), (intro || '').trim(), offersJson, keywordsJson, needsJson, (wechat || '').trim(), now, req.userId);
    updateUserNick.run(nickname.trim(), req.userId);
  })();

  const profile = db.prepare('SELECT p.*, u.avatar FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?').get(req.userId);

  res.json({
    ...profile,
    offers: safeJson(profile.offers, []),
    keywords: safeJson(profile.keywords, []),
    needs: safeJson(profile.needs, []),
  });
});

/* ============================================
 *  DELETE /api/profiles/mine  删除我的档案
 * ============================================ */

router.delete('/mine', auth, (req, res) => {
  const result = db.prepare('DELETE FROM profiles WHERE user_id = ?').run(req.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '档案不存在' });
  }
  res.json({ success: true });
});

/* ============================================
 *  GET /api/profiles/stats  统计（总人数/能力数等）
 * ============================================ */

/* 简单内存缓存，30 秒过期 */
let statsCache = { total: 0, timestamp: 0 };

router.get('/stats', (req, res) => {
  const now = Date.now();
  if (now - statsCache.timestamp < 30 * 1000) {
    return res.json({ total: statsCache.total });
  }
  const total = db.prepare('SELECT COUNT(*) as count FROM profiles').get().count;
  statsCache = { total, timestamp: now };
  res.json({ total });
});

function safeJson(str, fallback) {
  if (str == null) return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed != null ? parsed : fallback;
  } catch { return fallback; }
}

module.exports = router;
