const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config');

const dbPath = config.dbPath || path.join(__dirname, 'data.db');
const dbDir = path.dirname(dbPath);
if (dbDir !== '.') {
  require('fs').mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

/* 启用 WAL 模式，提高并发性能 */
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* 建表 */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    nickname TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    wechat_openid TEXT UNIQUE,
    wechat_unionid TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    intro TEXT NOT NULL DEFAULT '',
    offers TEXT NOT NULL DEFAULT '[]',
    keywords TEXT NOT NULL DEFAULT '[]',
    needs TEXT NOT NULL DEFAULT '[]',
    wechat TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);
`);

module.exports = db;
