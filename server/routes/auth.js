const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const config = require('../config');
const logger = require('../logger');
const { auth, revokeToken } = require('../middleware/auth');
const { sanitizeString } = require('../utils/sanitize');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

/* ============================================================
 * 预编译语句（模块级复用，避免每次请求重复 prepare）
 * ============================================================ */
const stmtFindUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtFindUsername = db.prepare('SELECT id FROM users WHERE username = ?');
const stmtInsertUser = db.prepare('INSERT INTO users (id, username, password_hash, nickname) VALUES (?, ?, ?, ?)');
const stmtInsertProfile = db.prepare('INSERT OR IGNORE INTO profiles (id, user_id, nickname) VALUES (?, ?, ?)');
const stmtInsertWxUser = db.prepare('INSERT INTO users (id, username, password_hash, nickname, avatar, wechat_openid, wechat_unionid) VALUES (?, ?, ?, ?, ?, ?, ?)');
const stmtFindUserByOpenid = db.prepare('SELECT * FROM users WHERE wechat_openid = ?');
const stmtGetUserInfo = db.prepare('SELECT id, username, nickname, avatar, wechat_openid FROM users WHERE id = ?');
const stmtGetUserProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?');
const stmtGetUserForDelete = db.prepare('SELECT id, password_hash, wechat_openid FROM users WHERE id = ?');
const stmtDeleteUser = db.prepare('DELETE FROM users WHERE id = ?');

/**
 * POST /api/auth/register
 * 用户名 + 密码注册
 * @param {string} req.body.username  - 用户名（2~20 字符）
 * @param {string} req.body.password  - 密码（6~128 字符）
 * @param {string} req.body.nickname  - 昵称（≤20 字符）
 * @returns {{ token: string, userId: string, nickname: string }}
 */
router.post('/register', asyncHandler(async (req, res) => {
  const username = sanitizeString(req.body.username, 20);
  const password = req.body.password || '';
  const nickname = sanitizeString(req.body.nickname, 20);

  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '用户名、密码、昵称不能为空' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名需 2~20 个字符' });
  }
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: '密码需 6~128 位' });
  }
  if (nickname.length > 20) {
    return res.status(400).json({ error: '昵称最多 20 个字符' });
  }

  const existing = stmtFindUsername.get(username);
  if (existing) {
    return res.status(409).json({ error: '该用户名已被注册' });
  }

  const id = 'u_' + crypto.randomUUID().slice(0, 12);
  const hash = await bcrypt.hash(password, 10);
  const pid = 'p_' + crypto.randomUUID().slice(0, 12);

  /* 事务：原子写入 user + profile */
  db.transaction(() => {
    stmtInsertUser.run(id, username, hash, nickname);
    stmtInsertProfile.run(pid, id, nickname);
  })();

  const token = jwt.sign({ userId: id }, config.jwtSecret, { expiresIn: '30d' });

  res.json({ token, userId: id, nickname });
}));

/* ============================================
 *  用户名 + 密码登录
 * ============================================ */

/**
 * POST /api/auth/login
 * 用户名 + 密码登录
 * 始终执行 bcrypt 比对，避免通过响应时间差异枚举用户
 * @param {string} req.body.username
 * @param {string} req.body.password
 * @returns {{ token: string, userId: string, nickname: string }}
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = stmtFindUserByUsername.get(username);
  /* 始终执行 bcrypt 比对，避免通过响应时间差异枚举用户 */
  const hash = user ? user.password_hash : bcrypt.hashSync('dummy', 10);
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });

  res.json({ token, userId: user.id, nickname: user.nickname });
}));

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

/**
 * GET /api/auth/wechat/url
 * 获取微信扫码登录授权链接
 * @returns {{ url: string }}
 */
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

/**
 * GET /api/auth/wechat/callback
 * 微信 OAuth 回调：用 code 换 token，查找或创建用户，重定向到前端并携带 token
 * @param {string} req.query.code  - 微信授权码
 * @param {string} req.query.state - CSRF 防护 state
 * 成功时重定向到 /#token=...，失败时返回 400/500 纯文本
 */
router.get('/wechat/callback', asyncHandler(async (req, res) => {
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
    const nickname = (wxUser && !wxUser.errcode && wxUser.nickname) ? sanitizeString(wxUser.nickname, 20) : '微信用户';
    const avatar = (wxUser && !wxUser.errcode && wxUser.headimgurl) ? wxUser.headimgurl : '';

    /* 查找或创建用户（事务） */
    let user = stmtFindUserByOpenid.get(openid);
    if (!user) {
      const id = 'u_' + crypto.randomUUID().slice(0, 12);
      const username = 'wx_' + crypto.randomUUID().slice(0, 8); // 用随机 UUID 避免碰撞
      const pid = 'p_' + crypto.randomUUID().slice(0, 12);

      try {
        db.transaction(() => {
          stmtInsertWxUser.run(id, username, '', nickname, avatar, openid, unionid || '');
          stmtInsertProfile.run(pid, id, nickname);
        })();
      } catch (e) {
        logger.error({ err: e.message }, '微信用户创建失败');
        /* 可能是 username 碰撞，重试一次 */
        const retryUsername = 'wx_' + crypto.randomUUID().slice(0, 8);
        const retryId = 'u_' + crypto.randomUUID().slice(0, 12);
        const retryPid = 'p_' + crypto.randomUUID().slice(0, 12);
        try {
          db.transaction(() => {
            stmtInsertWxUser.run(retryId, retryUsername, '', nickname, avatar, openid, unionid || '');
            stmtInsertProfile.run(retryPid, retryId, nickname);
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
}));

/* ============================================
 *  POST /api/auth/logout  登出（撤销当前 token）
 * ============================================ */

/**
 * POST /api/auth/logout
 * 登出：撤销当前 token，使其立即失效
 * 客户端需同时清除本地存储的 token
 * @returns {{ success: boolean }}
 */
router.post('/logout', auth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  revokeToken(token);
  res.json({ success: true });
});

/* ============================================
 *  获取当前用户信息
 * ============================================ */

/**
 * GET /api/auth/me
 * 获取当前登录用户的用户信息和资料
 * @returns {{ user: object, profile: object|null }}
 */
router.get('/me', auth, (req, res) => {
  const user = stmtGetUserInfo.get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const profile = stmtGetUserProfile.get(req.userId);

  res.json({ user, profile: profile || null });
});

/* ============================================
 *  DELETE /api/auth/me  注销账户
 *  需要提供密码确认（非微信用户）
 * ============================================ */

/**
 * DELETE /api/auth/me
 * 注销当前用户账户，需要密码确认（非微信登录用户）
 * CASCADE 外键会自动删除关联的 profile 数据
 * @param {string} [req.body.password] - 密码（非微信用户必填）
 * @returns {{ success: boolean }}
 */
router.delete('/me', auth, asyncHandler(async (req, res) => {
  const { password } = req.body;

  const user = stmtGetUserForDelete.get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  /* 微信用户无需密码确认 */
  if (!user.wechat_openid) {
    if (!password) {
      return res.status(400).json({ error: '请输入密码以确认注销' });
    }
    if (!await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: '密码错误' });
    }
  }

  /* CASCADE 会自动删除关联的 profile */
  stmtDeleteUser.run(req.userId);

  /* 撤销当前 token，使其立即失效 */
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  revokeToken(token);

  logger.info({ userId: req.userId }, '用户已注销');

  res.json({ success: true });
}));

module.exports = router;
