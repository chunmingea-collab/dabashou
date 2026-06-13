const express = require('express');
const cors = require('cors');
const path = require('path');
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

/* API 路由 */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profiles', require('./routes/profiles'));

/* 静态文件 —— 前端页面 */
app.use(express.static(path.join(__dirname, '..')));

/* SPA fallback：所有非 API 路径返回 index.html */
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

function start() {
  app.listen(config.port, () => {
    logger.info({ port: config.port, wechatEnabled: config.wechat.enabled }, '搭把手 服务已启动');
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
