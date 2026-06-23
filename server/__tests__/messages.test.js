/**
 *  messages 路由测试
 *  覆盖：发送私信、未读数、会话列表、对话记录、消息删除
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test_messages.db');
process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test_secret';
process.env.RATE_LIMIT = 'false';

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
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM profiles');
  db.exec('DELETE FROM users');
});

/* 辅助：注册两个用户 */
async function registerTwoUsers(app) {
  const aRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'alice', password: '123456', nickname: 'Alice' });
  const bRes = await request(app)
    .post('/api/auth/register')
    .send({ username: 'bob', password: '123456', nickname: 'Bob' });
  return {
    alice: { token: aRes.body.token, id: aRes.body.userId },
    bob: { token: bRes.body.token, id: bRes.body.userId },
  };
}

describe('POST /api/messages', () => {
  test('发送私信成功', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: bob.id, body: 'Hello Bob!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toMatch(/^m_/);
  });

  test('发送给不存在的用户返回 404', async () => {
    const { alice } = await registerTwoUsers(app);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: 'u_nonexistent', body: 'Hi' });

    expect(res.status).toBe(404);
  });

  test('不能给自己发私信', async () => {
    const { alice } = await registerTwoUsers(app);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: alice.id, body: 'Hi me' });

    expect(res.status).toBe(400);
  });

  test('消息内容不能为空', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: bob.id, body: '   ' });

    expect(res.status).toBe(400);
  });

  test('消息超过 500 字返回 400', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: bob.id, body: 'A'.repeat(501) });

    expect(res.status).toBe(400);
  });

  test('XSS 内容被清洗', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: bob.id, body: '<script>alert(1)</script>' });

    expect(res.status).toBe(200);
    /* 确认存储的内容已被清洗（HTML 标签被移除）*/
    const msg = db.prepare('SELECT body FROM messages WHERE id = ?').get(res.body.id);
    expect(msg.body).not.toContain('<script>');
    expect(msg.body).not.toContain('</script>');
    /* 纯文字内容本身不危险，会保留 */
    expect(msg.body).toContain('alert');
  });
});

describe('GET /api/messages/unread', () => {
  test('新消息未读数正确', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    const sendRes = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + bob.token)
      .send({ receiver_id: alice.id, body: 'Hello Alice' });
    expect(sendRes.status).toBe(200);

    const unreadRes = await request(app)
      .get('/api/messages/unread')
      .set('Authorization', 'Bearer ' + alice.token);

    expect(unreadRes.status).toBe(200);
    expect(unreadRes.body.count).toBe(1);
  });

  test('未登录返回 401', async () => {
    const res = await request(app).get('/api/messages/unread');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/messages/threads', () => {
  test('返回会话列表', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + bob.token)
      .send({ receiver_id: alice.id, body: 'Hello from Bob' });

    const res = await request(app)
      .get('/api/messages/threads')
      .set('Authorization', 'Bearer ' + alice.token);

    expect(res.status).toBe(200);
    expect(res.body.threads.length).toBe(1);
    expect(res.body.threads[0].other_nickname).toBe('Bob');
    expect(res.body.threads[0].unread_count).toBe(1);
  });
});

describe('GET /api/messages/thread/:userId', () => {
  test('对话记录标记已读', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + bob.token)
      .send({ receiver_id: alice.id, body: 'Hello' });

    /* Alice 打开对话，消息应被标记已读 */
    const res = await request(app)
      .get('/api/messages/thread/' + bob.id)
      .set('Authorization', 'Bearer ' + alice.token);

    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(1);

    /* 未读数应为 0 */
    const unreadRes = await request(app)
      .get('/api/messages/unread')
      .set('Authorization', 'Bearer ' + alice.token);
    expect(unreadRes.body.count).toBe(0);
  });
});

describe('DELETE /api/messages/:id', () => {
  test('发送者可以删除自己的消息', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    const sendRes = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: bob.id, body: 'Delete me' });

    const msgId = sendRes.body.id;

    const delRes = await request(app)
      .delete('/api/messages/' + msgId)
      .set('Authorization', 'Bearer ' + alice.token);

    expect(delRes.status).toBe(200);

    /* 确认已删除 */
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
    expect(msg).toBeUndefined();
  });

  test('非参与者不能删除', async () => {
    const { alice, bob } = await registerTwoUsers(app);

    /* 注册第三个用户 */
    const cRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'charlie', password: '123456', nickname: 'Charlie' });

    const sendRes = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({ receiver_id: bob.id, body: 'Private' });

    const delRes = await request(app)
      .delete('/api/messages/' + sendRes.body.id)
      .set('Authorization', 'Bearer ' + cRes.body.token);

    expect(delRes.status).toBe(404);
  });
});
