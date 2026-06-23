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
db.pragma('synchronous = NORMAL');   /* WAL 模式下 NORMAL 足够安全，性能更好 */
db.pragma('cache_size = -20000');     /* 20MB 缓存 */
db.pragma('busy_timeout = 5000');     /* 5 秒忙等待，减少 SQLITE_BUSY */

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
    city TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);
  CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
  CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);

  /* 收藏表：用户 - 档案 多对多关系 */
  CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    PRIMARY KEY (user_id, profile_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_favorites_profile_id ON favorites(profile_id);

  /* 举报表：用户举报档案记录，管理员处理 */
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_reports_profile_id ON reports(profile_id);
`);

/* 删除早期版本遗留的冗余索引（user_id 已有 UNIQUE 自动索引）*/
db.exec(`DROP INDEX IF EXISTS idx_profiles_user_id;`);

/* ============================================================
 * messages 表：站内私信
 * ============================================================ */
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    body TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

/* ============================================================
 * FTS5 全文搜索虚拟表
 * 用于替代 LIKE '%keyword%' 全表扫描，支持中文子串匹配
 * tokenizer=unicode61 remove_diacritics 2：兼顾 ASCII 和 Unicode
 * content_rowsid 关联 profiles.rowid，避免数据重复存储
 * ============================================================ */
const ftsExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='profiles_fts'").get();
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS profiles_fts USING fts5(
    nickname, intro, keywords, offers, needs,
    content='profiles', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );

  /* 触发器：profiles 增删改时同步到 FTS */
  CREATE TRIGGER IF NOT EXISTS profiles_ai AFTER INSERT ON profiles BEGIN
    INSERT INTO profiles_fts(rowid, nickname, intro, keywords, offers, needs)
    VALUES (new.rowid, new.nickname, new.intro, new.keywords, new.offers, new.needs);
  END;
  CREATE TRIGGER IF NOT EXISTS profiles_ad AFTER DELETE ON profiles BEGIN
    INSERT INTO profiles_fts(profiles_fts, rowid, nickname, intro, keywords, offers, needs)
    VALUES ('delete', old.rowid, old.nickname, old.intro, old.keywords, old.offers, old.needs);
  END;
  CREATE TRIGGER IF NOT EXISTS profiles_au AFTER UPDATE ON profiles BEGIN
    INSERT INTO profiles_fts(profiles_fts, rowid, nickname, intro, keywords, offers, needs)
    VALUES ('delete', old.rowid, old.nickname, old.intro, old.keywords, old.offers, old.needs);
    INSERT INTO profiles_fts(rowid, nickname, intro, keywords, offers, needs)
    VALUES (new.rowid, new.nickname, new.intro, new.keywords, new.offers, new.needs);
  END;
`);

/* 首次创建 FTS 表时，把现有 profiles 数据灌入（仅执行一次）*/
if (!ftsExists) {
  db.exec(`
    INSERT INTO profiles_fts(profiles_fts) VALUES('rebuild');
  `);
}

module.exports = db;
