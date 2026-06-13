/**
 *  profiles 路由测试
 *  覆盖：公开列表、搜索、我的档案、更新、删除、统计
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test_profiles.db');
process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test_secret';

let app, db;

beforeAll(() => {
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

/* 辅助：注册并更新档案 */
async function registerAndFillProfile(app, overrides = {}) {
  const authRes = await request(app)
    .post('/api/auth/register')
    .send({
      username: overrides.username || 'test_' + Date.now(),
      password: '123456',
      nickname: overrides.nickname || 'TestUser',
    });
  const token = authRes.body.token;

  await request(app)
    .put('/api/profiles/mine')
    .set('Authorization', 'Bearer ' + token)
    .send({
      nickname: overrides.nickname || 'TestUser',
      intro: overrides.intro || '我是一名设计师',
      offers: overrides.offers || ['设计', '画画'],
      keywords: overrides.keywords || ['设计', 'UI'],
      needs: overrides.needs || ['学编程'],
      wechat: overrides.wechat || 'test_wechat',
    });

  return { token, user: authRes.body };
}

describe('GET /api/profiles', () => {
  test('空列表返回空数组', async () => {
    const res = await request(app).get('/api/profiles');
    expect(res.status).toBe(200);
    expect(res.body.profiles).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('返回所有档案', async () => {
    await registerAndFillProfile(app, { username: 'user1', nickname: 'Alice' });
    await registerAndFillProfile(app, { username: 'user2', nickname: 'Bob' });

    const res = await request(app).get('/api/profiles');
    expect(res.status).toBe(200);
    expect(res.body.profiles.length).toBe(2);
    expect(res.body.total).toBe(2);
  });

  test('?q= 关键字搜索', async () => {
    await registerAndFillProfile(app, { username: 'u1', nickname: 'Alice', intro: '前端开发' });
    await registerAndFillProfile(app, { username: 'u2', nickname: 'Bob', keywords: ['后端', 'Java'] });

    const res = await request(app).get('/api/profiles?q=前端');
    expect(res.status).toBe(200);
    expect(res.body.profiles.length).toBe(1);
    expect(res.body.profiles[0].nickname).toBe('Alice');
  });

  test('?q= 搜索不区分大小写', async () => {
    await registerAndFillProfile(app, { username: 'u1', nickname: 'Alice', intro: 'JavaScript expert' });
    await registerAndFillProfile(app, { username: 'u2', nickname: 'Bob' });

    const res = await request(app).get('/api/profiles?q=javascript');
    expect(res.status).toBe(200);
    expect(res.body.profiles.length).toBe(1);
  });

  test('分页参数', async () => {
    for (let i = 1; i <= 5; i++) {
      await registerAndFillProfile(app, { username: 'u' + i, nickname: 'User' + i });
    }

    const res = await request(app).get('/api/profiles?size=2&page=1');
    expect(res.status).toBe(200);
    expect(res.body.profiles.length).toBe(2);
    expect(res.body.total).toBe(5);
    expect(res.body.page).toBe(1);
  });
});

describe('GET /api/profiles/mine', () => {
  test('返回我的档案', async () => {
    const { token } = await registerAndFillProfile(app, { username: 'mine', nickname: 'Mine' });

    const res = await request(app)
      .get('/api/profiles/mine')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('Mine');
    expect(res.body.intro).toBe('我是一名设计师');
    expect(Array.isArray(res.body.offers)).toBe(true);
    expect(res.body.offers).toContain('设计');
  });

  test('未登录返回 401', async () => {
    const res = await request(app).get('/api/profiles/mine');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/profiles/mine', () => {
  test('更新档案成功', async () => {
    const { token } = await registerAndFillProfile(app, { username: 'update', nickname: 'Old' });

    const res = await request(app)
      .put('/api/profiles/mine')
      .set('Authorization', 'Bearer ' + token)
      .send({
        nickname: 'New',
        intro: '新介绍',
        offers: ['A', 'B'],
        keywords: ['C'],
        needs: ['D'],
        wechat: 'new_wx',
      });

    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('New');
    expect(res.body.intro).toBe('新介绍');

    /* 确认昵称同步到 users 表 */
    const user = db.prepare('SELECT nickname FROM users WHERE username = ?').get('update');
    expect(user.nickname).toBe('New');
  });

  test('昵称为空返回 400', async () => {
    const authRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'empty_nick', password: '123456', nickname: 'Test' });
    const token = authRes.body.token;

    const res = await request(app)
      .put('/api/profiles/mine')
      .set('Authorization', 'Bearer ' + token)
      .send({ nickname: '  ', intro: '', offers: [], keywords: [], needs: [], wechat: '' });

    expect(res.status).toBe(400);
  });

  test('介绍过长返回 400', async () => {
    const { token } = await registerAndFillProfile(app, { username: 'long_intro', nickname: 'Test' });

    const res = await request(app)
      .put('/api/profiles/mine')
      .set('Authorization', 'Bearer ' + token)
      .send({ nickname: 'Test', intro: 'A'.repeat(201), offers: [], keywords: [], needs: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('200');
  });
});

describe('DELETE /api/profiles/mine', () => {
  test('删除档案成功', async () => {
    const { token } = await registerAndFillProfile(app, { username: 'delete', nickname: 'Del' });

    const res = await request(app)
      .delete('/api/profiles/mine')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    /* 确认已删除 */
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(res.body.userId);
    expect(profile).toBeUndefined();
  });

  test('重复删除返回 404', async () => {
    const { token } = await registerAndFillProfile(app, { username: 'del2', nickname: 'Del2' });

    await request(app)
      .delete('/api/profiles/mine')
      .set('Authorization', 'Bearer ' + token);

    const res = await request(app)
      .delete('/api/profiles/mine')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/profiles/stats', () => {
  test('返回总数', async () => {
    await registerAndFillProfile(app, { username: 's1', nickname: 'A' });
    await registerAndFillProfile(app, { username: 's2', nickname: 'B' });

    const res = await request(app).get('/api/profiles/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });
});
