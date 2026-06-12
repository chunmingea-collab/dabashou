const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./db');

const app = express();

app.use(cors({
  origin: config.origin,
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));

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

app.listen(config.port, () => {
  console.log('===================================');
  console.log('  搭把手 服务已启动');
  console.log('  打开浏览器访问: http://localhost:' + config.port);
  console.log('  ' + (config.wechat.enabled ? '微信登录：已启用' : '微信登录：未启用（填写AppID后启用）'));
  console.log('===================================');
});

/* 优雅关闭 */
function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭...`);
  try { db.close(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('未捕获的异步错误:', err);
});
