const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const config = require('../config');
const logger = require('../logger');

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
  if (nickname.length > 20) {
    return res.status(400).json({ error: '昵称最多 20 个字符' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: '该用户名已被注册' });
  }

  const id = 'u_' + crypto.randomUUID().slice(0, 12);
  const hash = bcrypt.hashSync(password, 10);
  const pid = 'p_' + crypto.randomUUID().slice(0, 12);

  /* 事务：原子写入 user + profile */
  const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, nickname) VALUES (?, ?, ?, ?)');
  const insertProfile = db.prepare('INSERT INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)');
  db.transaction(() => {
    insertUser.run(id, username, hash, nickname);
    insertProfile.run(pid, id, nickname);
  })();

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

/* 内存 state 存储，用于 CSRF 防护，10 分钟过期 */
const stateStore = new Map();
const stateCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, expires] of stateStore) {
    if (expires < now) stateStore.delete(key);
  }
}, 5 * 60 * 1000);
/* 允许测试框架卸载定时器 */
if (typeof stateCleanupTimer.unref === 'function') stateCleanupTimer.unref();

router.get('/wechat/url', (req, res) => {
  const wc = config.wechat;
  if (!wc.enabled || !wc.appId) {
    return res.status(400).json({ error: '微信登录未启用，请管理员配置 AppID' });
  }
  const state = crypto.randomUUID();
  stateStore.set(state, Date.now() + 10 * 60 * 1000); // 10 分钟有效
  const url =
    `https://open.weixin.qq.com/connect/qrconnect?appid=${wc.appId}` +
    `&redirect_uri=${encodeURIComponent(wc.redirectUri)}` +
    `&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
  res.json({ url });
});

router.get('/wechat/callback', async (req, res) => {
  const wc = config.wechat;
  if (!wc.enabled || !wc.appId || !wc.appSecret) {
    return res.status(400).send('微信登录未启用');
  }

  const { code, state } = req.query;

  /* CSRF 防护：验证 state 参数 */
  if (!state || !stateStore.has(state)) {
    return res.status(400).send('无效的登录请求，请重新扫码');
  }
  stateStore.delete(state); // 一次性使用

  if (!code) {
    return res.status(400).send('缺少授权码');
  }

  try {
    /* 用 code 换 access_token */
    const tokenResp = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: { appid: wc.appId, secret: wc.appSecret, code, grant_type: 'authorization_code' },
    });

    /* 检查微信 API 错误 */
    if (tokenResp.data.errcode) {
      logger.error({ wechatError: tokenResp.data }, '微信 token 交换失败');
      return res.status(400).send('微信授权失败，请重新扫码');
    }

    const { access_token, openid, unionid } = tokenResp.data;
    if (!openid) {
      logger.error({ wechatError: tokenResp.data }, '微信 token 交换未返回 openid');
      return res.status(400).send('获取微信信息失败');
    }

    /* 获取用户信息 */
    const userResp = await axios.get('https://api.weixin.qq.com/sns/userinfo', {
      params: { access_token, openid },
    });

    if (userResp.data.errcode) {
      logger.error({ wechatUserInfoError: userResp.data }, '微信用户信息获取失败');
    }

    const wxUser = userResp.data;
    const nickname = (wxUser && !wxUser.errcode && wxUser.nickname) ? wxUser.nickname : '微信用户';
    const avatar = (wxUser && !wxUser.errcode && wxUser.headimgurl) ? wxUser.headimgurl : '';

    /* 查找或创建用户（事务） */
    let user = db.prepare('SELECT * FROM users WHERE wechat_openid = ?').get(openid);
    if (!user) {
      const id = 'u_' + crypto.randomUUID().slice(0, 12);
      const username = 'wx_' + crypto.randomUUID().slice(0, 8); // 用随机 UUID 避免碰撞
      const pid = 'p_' + crypto.randomUUID().slice(0, 12);

      const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, nickname, avatar, wechat_openid, wechat_unionid) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const insertProfile = db.prepare('INSERT INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)');
      try {
        db.transaction(() => {
          insertUser.run(id, username, '', nickname, avatar, openid, unionid || '');
          insertProfile.run(pid, id, nickname);
        })();
      } catch (e) {
        logger.error({ err: e.message }, '微信用户创建失败');
        /* 可能是 username 碰撞，重试一次 */
        const retryUsername = 'wx_' + crypto.randomUUID().slice(0, 8);
        const retryId = 'u_' + crypto.randomUUID().slice(0, 12);
        const retryPid = 'p_' + crypto.randomUUID().slice(0, 12);
        try {
          db.transaction(() => {
            insertUser.run(retryId, retryUsername, '', nickname, avatar, openid, unionid || '');
            insertProfile.run(retryPid, retryId, nickname);
          })();
          user = { id: retryId, nickname };
        } catch (e2) {
          logger.error({ err: e2.message }, '微信用户创建重试失败');
          return res.status(500).send('登录异常，请重试');
        }
      }
      if (!user) user = { id, nickname };
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });

    /* 使用 URL fragment 传递 token，不在服务器日志中泄露 */
    res.redirect(`/#token=${token}&userId=${user.id}&nickname=${encodeURIComponent(user.nickname)}`);
  } catch (e) {
    logger.error({ err: e.message, wechatError: true }, '微信登录异常');
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

/* ============================================
 *  DELETE /api/auth/me  注销账户
 *  需要提供密码确认
 * ============================================ */

router.delete('/me', auth, (req, res) => {
  const { password } = req.body;

  const user = db.prepare('SELECT id, password_hash, wechat_openid FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  /* 微信用户无需密码确认 */
  if (!user.wechat_openid) {
    if (!password) {
      return res.status(400).json({ error: '请输入密码以确认注销' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '密码错误' });
    }
  }

  /* CASCADE 会自动删除关联的 profile */
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);

  logger.info({ userId: req.userId }, '用户已注销');

  res.json({ success: true });
});

module.exports = router;
