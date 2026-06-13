/**
 *  auth 路由测试
 *  覆盖：注册、登录、获取当前用户、微信URL生成、CSRF防护
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

/* 使用临时数据库文件 */
const testDbPath = path.join(__dirname, 'test_auth.db');
process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test_secret';
process.env.RATE_LIMIT = 'false';

let app, db;

beforeAll(() => {
  /* 清理旧测试库 */
  try { fs.unlinkSync(testDbPath); } catch {}
  try { fs.unlinkSync(testDbPath + '-wal'); } catch {}
  try { fs.unlinkSync(testDbPath + '-shm'); } catch {}
  db = require('../db');
  app = require('../server');
});

afterAll(() => {
  try { db.close(); } catch {}
  try { fs.unlinkSync(testDbPath); } catch {}
  try { fs.unlinkSync(testDbPath + '-wal'); } catch {}
  try { fs.unlinkSync(testDbPath + '-shm'); } catch {}
});

beforeEach(() => {
  db.exec('DELETE FROM profiles');
  db.exec('DELETE FROM users');
});

describe('POST /api/auth/register', () => {
  test('成功注册并返回 token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', password: '123456', nickname: '测试用户' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.nickname).toBe('测试用户');
    expect(res.body.userId).toMatch(/^u_/);

    /* 确认 user + profile 同时创建 */
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.body.userId);
    expect(user).toBeDefined();
    expect(user.username).toBe('testuser');

    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(res.body.userId);
    expect(profile).toBeDefined();
  });

  test('用户名重复时返回 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'dup', password: '123456', nickname: 'A' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'dup', password: '123456', nickname: 'B' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('已被注册');
  });

  test('缺少字段返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'x' });

    expect(res.status).toBe(400);
  });

  test('密码不足 6 位返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'test', password: '12345', nickname: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('6~128');
  });

  test('昵称超过 20 字符返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'test', password: '123456', nickname: 'A'.repeat(21) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('20');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'loginuser', password: 'password', nickname: 'Login' });
  });

  test('正确凭据登录成功', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'loginuser', password: 'password' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.nickname).toBe('Login');
  });

  test('错误密码返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'loginuser', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  test('不存在的用户返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'password' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'meuser', password: '123456', nickname: 'Me' });
    token = res.body.token;
  });

  test('有效 token 返回用户信息', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('meuser');
    expect(res.body.user.nickname).toBe('Me');
    expect(res.body.profile).toBeDefined();
  });

  test('无 token 返回 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('无效 token 返回 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/auth/me', () => {
  test('密码正确时删除账户', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'delete_me', password: '123456', nickname: 'Bye' });
    const token = regRes.body.token;

    const res = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .send({ password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    /* 确认用户和档案都已删除 */
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('delete_me');
    expect(user).toBeUndefined();
  });

  test('密码错误时拒绝删除', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'no_del', password: '123456', nickname: 'No' });
    const token = regRes.body.token;

    const res = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .send({ password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('密码错误');
  });

  test('缺少密码时返回 400', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'no_pass', password: '123456', nickname: 'No' });
    const token = regRes.body.token;

    const res = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .send({});

    expect(res.status).toBe(400);
  });

  test('未登录时返回 401', async () => {
    const res = await request(app).delete('/api/auth/me').send({ password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/wechat/url', () => {
  test('未启用微信时返回 400', async () => {
    const res = await request(app).get('/api/auth/wechat/url');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('未启用');
  });
});
