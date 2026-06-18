const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

/* JWT 鉴权中间件 */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  const token = header.slice(7);
  /* 检查 token 是否在黑名单中（登出/注销后撤销）*/
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ error: '登录已失效，请重新登录' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/* 可选鉴权 —— 不强制登录，但如果有 token 就解析 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    if (!tokenBlacklist.has(token)) {
      try {
        const payload = jwt.verify(token, config.jwtSecret);
        req.userId = payload.userId;
      } catch { /* token 无效忽略 */ }
    }
  }
  next();
}

/* 管理员鉴权 —— 必须先通过 auth，再检查用户名是否在管理员列表 */
function adminAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
  if (!user || !config.adminUsernames.includes(user.username.toLowerCase())) {
    return res.status(403).json({ error: '无管理员权限' });
  }
  next();
}

/* JWT 黑名单（内存）—— 登出/注销时加入，过期自动清理 */
const tokenBlacklist = new Map(); // token -> expiry(timestamp)
/* 定期清理过期黑名单条目，避免内存无限增长 */
const blacklistCleanup = setInterval(() => {
  const now = Date.now();
  for (const [tok, exp] of tokenBlacklist) {
    if (exp < now) tokenBlacklist.delete(tok);
  }
}, 60 * 60 * 1000); // 每小时清理一次
if (typeof blacklistCleanup.unref === 'function') blacklistCleanup.unref();

/* 加入黑名单（登出/注销时调用）*/
function revokeToken(token) {
  if (!token) return;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    tokenBlacklist.set(token, (payload.exp || 0) * 1000);
  } catch { /* token 无效则无需加入黑名单 */ }
}

module.exports = { auth, optionalAuth, adminAuth, revokeToken };
