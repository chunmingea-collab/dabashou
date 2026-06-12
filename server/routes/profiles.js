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
    const keyword = `%${q.trim()}%`;
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
  let profile = db.prepare('SELECT p.*, u.avatar FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?').get(req.userId);

  if (!profile) {
    /* 用户存在但没有档案，创建一个 */
    const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.userId);
    const pid = 'p_' + crypto.randomUUID().slice(0, 12);
    db.prepare('INSERT INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)').run(pid, req.userId, user.nickname);
    profile = db.prepare('SELECT p.*, u.avatar FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?').get(req.userId);
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

  const now = Date.now();
  const offersJson = JSON.stringify(Array.isArray(offers) ? offers.filter(Boolean) : []);
  const keywordsJson = JSON.stringify(Array.isArray(keywords) ? keywords.filter(Boolean) : []);
  const needsJson = JSON.stringify(Array.isArray(needs) ? needs.filter(Boolean) : []);

  db.prepare(`
    UPDATE profiles
    SET nickname = ?, intro = ?, offers = ?, keywords = ?, needs = ?, wechat = ?, updated_at = ?
    WHERE user_id = ?
  `).run(nickname.trim(), (intro || '').trim(), offersJson, keywordsJson, needsJson, (wechat || '').trim(), now, req.userId);

  /* 同步昵称到 users 表 */
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname.trim(), req.userId);

  const profile = db.prepare('SELECT p.*, u.avatar FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?').get(req.userId);

  res.json({
    ...profile,
    offers: safeJson(profile.offers, []),
    keywords: safeJson(profile.keywords, []),
    needs: safeJson(profile.needs, []),
  });
});

/* ============================================
 *  GET /api/profiles/stats  统计（总人数/能力数等）
 * ============================================ */

router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM profiles').get().count;
  res.json({ total });
});

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
