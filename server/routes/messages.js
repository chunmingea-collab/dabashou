const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { auth } = require('../middleware/auth');

const router = express.Router();

/* ============================================================
 * 消息发送速率限制：每 IP 10 分钟内最多 10 条
 * 可通过环境变量 RATE_LIMIT=false 关闭所有限速
 * ============================================================ */
const msgLimiter = config.rateLimit
  ? rateLimit({
      windowMs: 10 * 60 * 1000,
      max: 10,
      message: { error: '消息发送过于频繁，请 10 分钟后再试' },
      standardHeaders: true,
      legacyHeaders: false,
    })
  : null;

/* ============================================================
 * 预编译语句（模块级复用，避免每次请求重复 prepare）
 * ============================================================ */
const stmtSend = db.prepare(`
  INSERT INTO messages (id, sender_id, receiver_id, body, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const stmtUnreadCount = db.prepare(`
  SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0
`);
const stmtMarkRead = db.prepare(`
  UPDATE messages SET is_read = 1
  WHERE receiver_id = ? AND sender_id = ? AND is_read = 0
`);
const stmtDeleteMsg = db.prepare(`
  DELETE FROM messages WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
`);

/**
 * POST /api/messages
 * 发送私信（需登录，受速率限制）
 * @body {string} receiver_id - 接收者用户 ID
 * @body {string} body - 消息内容（最多 500 字）
 */
const postMiddleware = msgLimiter ? [auth, msgLimiter] : [auth];
router.post('/', ...postMiddleware, (req, res) => {
  const { receiver_id, body } = req.body;

  if (!receiver_id || typeof receiver_id !== 'string') {
    return res.status(400).json({ error: '请指定接收者' });
  }
  if (!body || !body.trim()) {
    return res.status(400).json({ error: '消息不能为空' });
  }
  if (body.trim().length > 500) {
    return res.status(400).json({ error: '消息最多 500 字' });
  }
  if (receiver_id === req.userId) {
    return res.status(400).json({ error: '不能给自己发私信' });
  }

  /* 确认接收者存在 */
  const receiver = db.prepare('SELECT id, nickname FROM users WHERE id = ?').get(receiver_id);
  if (!receiver) return res.status(404).json({ error: '用户不存在' });

  const id = 'm_' + crypto.randomUUID().slice(0, 12);
  const now = Date.now();
  stmtSend.run(id, req.userId, receiver_id, body.trim(), now);

  res.json({ success: true, id, created_at: now });
});

/**
 * GET /api/messages/unread
 * 获取当前用户的未读消息数
 */
router.get('/unread', auth, (req, res) => {
  const { count } = stmtUnreadCount.get(req.userId);
  res.json({ count });
});

/**
 * GET /api/messages/threads
 * 获取会话列表（收件箱），按最后消息时间倒序
 * @query {number} [page=1]
 * @query {number} [size=20]
 */
router.get('/threads', auth, (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const size = Math.min(Math.max(Number(req.query.size) || 20, 1), 50);
  const offset = (page - 1) * size;

  /* 先算总数（用于前端分页控件）*/
  const total = db.prepare(`
    SELECT COUNT(DISTINCT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) as cnt
    FROM messages
    WHERE sender_id = ? OR receiver_id = ?
  `).get(req.userId, req.userId, req.userId).cnt;

  const threads = db.prepare(`
    SELECT
      other_id,
      u.nickname AS other_nickname,
      u.avatar AS other_avatar,
      last_body,
      last_time,
      unread_count
    FROM (
      SELECT
        CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id,
        MAX(created_at) AS last_time,
        (SELECT body FROM messages m2
          WHERE (m2.sender_id = ? AND m2.receiver_id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END)
             OR (m2.receiver_id = ? AND m2.sender_id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END)
          ORDER BY m2.created_at DESC LIMIT 1) AS last_body,
        SUM(CASE WHEN receiver_id = ? AND is_read = 0 THEN 1 ELSE 0 END) AS unread_count
      FROM messages m
      WHERE sender_id = ? OR receiver_id = ?
      GROUP BY other_id
    ) t
    JOIN users u ON u.id = t.other_id
    ORDER BY last_time DESC
    LIMIT ? OFFSET ?
  `).all(
    req.userId,
    req.userId, req.userId, req.userId, req.userId,
    req.userId, req.userId, req.userId,
    size, offset
  );

  res.json({ threads, total, page, size });
});

/**
 * GET /api/messages/thread/:userId
 * 获取与指定用户的对话记录（时间正序）
 * @param {string} userId - 对话对方的用户 ID
 * @query {number} [page=1]
 * @query {number} [size=30]
 */
router.get('/thread/:userId', auth, (req, res) => {
  const otherId = req.params.userId;
  const { page = 1, size = 30 } = req.query;
  const limit = Math.min(Number(size) || 30, 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  /* 标记对方发来的消息为已读 */
  stmtMarkRead.run(req.userId, otherId);

  const msgs = db.prepare(`
    SELECT m.*, u.nickname AS sender_nickname, u.avatar AS sender_avatar
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, otherId, otherId, req.userId, limit, offset);

  /* 返回时间正序（UI 从旧到新展示）*/
  res.json({ messages: msgs.reverse(), page: Number(page), size: limit });
});

/**
 * DELETE /api/messages/:id
 * 删除单条消息（仅限发送者或接收者）
 * @param {string} id - 消息 ID
 */
router.delete('/:id', auth, (req, res) => {
  const result = stmtDeleteMsg.run(req.params.id, req.userId, req.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '消息不存在或无权限' });
  }
  res.json({ success: true });
});

module.exports = router;
