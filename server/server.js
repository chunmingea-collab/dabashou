const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();

app.use(cors());
app.use(express.json());

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

process.on('unhandledRejection', (err) => {
  console.error('未捕获的异步错误:', err.message);
});
