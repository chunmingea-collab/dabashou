const jwt = require('jsonwebtoken');
const config = require('../config');

/* JWT 鉴权中间件 */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  const token = header.slice(7);
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
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret);
      req.userId = payload.userId;
    } catch { /* token 无效忽略 */ }
  }
  next();
}

module.exports = { auth, optionalAuth };
