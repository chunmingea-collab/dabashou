const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const config = require('../config');

const router = express.Router();

/* ============================================
 *  用户名 + 密码注册
 * ============================================ */

router.post('/register', (req, res) => {
  const { username, password, nickname } = req.body;

  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '用户名、密码、昵称不能为空' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名需 2~20 个字符' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: '该用户名已被注册' });
  }

  const id = 'u_' + crypto.randomUUID().slice(0, 12);
  const hash = bcrypt.hashSync(password, 10);

  db.prepare('INSERT INTO users (id, username, password_hash, nickname) VALUES (?, ?, ?, ?)').run(id, username, hash, nickname);

  /* 同时创建空白档案 */
  db.prepare('INSERT INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)').run('p_' + crypto.randomUUID().slice(0, 12), id, nickname);

  const token = jwt.sign({ userId: id }, config.jwtSecret, { expiresIn: '30d' });

  res.json({ token, userId: id, nickname });
});

/* ============================================
 *  用户名 + 密码登录
 * ============================================ */

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });

  res.json({ token, userId: user.id, nickname: user.nickname });
});

/* ============================================
 *  微信 OAuth 登录
 *  GET  /api/auth/wechat/url     获取微信授权链接
 *  GET  /api/auth/wechat/callback 微信回调
 * ============================================ */

router.get('/wechat/url', (req, res) => {
  const wc = config.wechat;
  if (!wc.enabled || !wc.appId) {
    return res.status(400).json({ error: '微信登录未启用，请管理员配置 AppID' });
  }
  const url =
    `https://open.weixin.qq.com/connect/qrconnect?appid=${wc.appId}` +
    `&redirect_uri=${encodeURIComponent(wc.redirectUri)}` +
    `&response_type=code&scope=snsapi_login&state=${crypto.randomUUID()}#wechat_redirect`;
  res.json({ url });
});

router.get('/wechat/callback', async (req, res) => {
  const wc = config.wechat;
  if (!wc.enabled || !wc.appId || !wc.appSecret) {
    return res.status(400).send('微信登录未启用');
  }

  const { code } = req.query;
  if (!code) {
    return res.status(400).send('缺少授权码');
  }

  try {
    /* 用 code 换 access_token */
    const tokenResp = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: { appid: wc.appId, secret: wc.appSecret, code, grant_type: 'authorization_code' },
    });

    const { access_token, openid, unionid } = tokenResp.data;
    if (!openid) {
      return res.status(400).send('获取微信信息失败');
    }

    /* 获取用户信息 */
    const userResp = await axios.get('https://api.weixin.qq.com/sns/userinfo', {
      params: { access_token, openid },
    });

    const wxUser = userResp.data;
    const nickname = wxUser.nickname || '微信用户';
    const avatar = wxUser.headimgurl || '';

    /* 查找或创建用户 */
    let user = db.prepare('SELECT * FROM users WHERE wechat_openid = ?').get(openid);
    if (!user) {
      const id = 'u_' + crypto.randomUUID().slice(0, 12);
      const username = 'wx_' + openid.slice(-8);
      db.prepare('INSERT INTO users (id, username, password_hash, nickname, avatar, wechat_openid, wechat_unionid) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, username, '', nickname, avatar, openid, unionid || '');
      db.prepare('INSERT INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)').run('p_' + crypto.randomUUID().slice(0, 12), id, nickname);
      user = { id, nickname };
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });

    /* 跳转回前端，token 通过 URL hash 传递 */
    res.redirect(`/?token=${token}&userId=${user.id}&nickname=${encodeURIComponent(user.nickname)}`);
  } catch (e) {
    console.error('WeChat auth error:', e.message);
    res.status(500).send('微信登录异常，请重试');
  }
});

/* ============================================
 *  获取当前用户信息
 * ============================================ */

const { auth } = require('../middleware/auth');

router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, nickname, avatar, wechat_openid FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId);

  res.json({ user, profile: profile || null });
});

module.exports = router;
