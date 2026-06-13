const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./logger');
const { requestLogger } = require('./middleware/logger');

const app = express();

app.use(cors({
  origin: config.origin,
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));
app.use(requestLogger);

/* 静态文件扩展名白名单 */
const ALLOWED_EXT = ['.html', '.css', '.js', '.png', '.jpg', '.svg', '.ico', '.webp', '.gif', '.woff2', '.woff'];

/* 速率限制共用配置 */
const rateLimitDefaults = { standardHeaders: true, legacyHeaders: false };

/* 全局温和速率限制：每 IP 15 秒最多 100 次 */
if (config.rateLimit) {
  app.use(rateLimit({
    ...rateLimitDefaults,
    windowMs: 15 * 1000,
    max: 100,
    message: { error: '请求过于频繁，请稍后再试' },
  }));
}

/* 登录/注册严格速率限制：每 IP 1 分钟最多 10 次 */
const authLimiter = config.rateLimit
  ? rateLimit({ ...rateLimitDefaults, windowMs: 60 * 1000, max: 10, message: { error: '操作过于频繁，请 1 分钟后再试' } })
  : null;

/* API 路由 */
const authRoute = require('./routes/auth');
if (authLimiter) {
  app.use('/api/auth', authLimiter, authRoute);
} else {
  app.use('/api/auth', authRoute);
}
app.use('/api/profiles', require('./routes/profiles'));

/* 拒绝访问敏感文件（必须在 express.static 之前才能真正拦截） */
app.use((req, res, next) => {
  const dangerous = /\.(db|db-wal|db-shm|env|log|md|lock\.json|yml|yaml)$/i;
  if (dangerous.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

/* 静态文件 —— 仅暴露前端资源 */
app.use(express.static(path.join(__dirname, '..'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (!ALLOWED_EXT.includes(path.extname(filePath).toLowerCase())) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

/* SPA fallback */
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return res.status(404).end();
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

function start() {
  app.listen(config.port, () => {
    logger.info({ port: config.port, wechatEnabled: config.wechat.enabled }, 'Huzoo 服务已启动');
  });

  /* 优雅关闭 */
  function shutdown(signal) {
    logger.info({ signal }, '收到信号，正在关闭...');
    try { require('./db').close(); } catch {}
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '未捕获的异步错误');
});

/* 直接运行（非 require 导入）时启动服务器 */
if (require.main === module) {
  start();
}

module.exports = app;
