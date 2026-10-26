const path = require("path");
const fs = require("fs");

// node:sqlite — متاح في Node 22.13+ بدون علامات
let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (e) {
  console.error("FATAL: node:sqlite غير متاح. تحتاج Node 22.13+");
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "yijeeb.db");
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA foreign_keys = ON");

// ===== المخطط =====
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  public_key TEXT,
  locale TEXT DEFAULT 'ar',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('dm','group','channel')),
  name TEXT,
  description TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  current_key_version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  last_read_id INTEGER DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'text',
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  ephemeral_ttl INTEGER DEFAULT 0,
  time INTEGER NOT NULL,
  key_version INTEGER DEFAULT 1,
  attachment_id TEXT,
  deleted INTEGER DEFAULT 0,
  edited_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_msg_conv_time ON messages(conversation_id, time DESC);
CREATE TABLE IF NOT EXISTS group_keys (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_version INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_conv ON attachments(conversation_id);
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS story_views (
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, viewer_id)
);
CREATE TABLE IF NOT EXISTS key_backups (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_user ON device_tokens(user_id);
`);

// ===== استعلامات جاهزة =====
const stmts = {
  insertMessage: db.prepare(
    `INSERT INTO messages (conversation_id, sender_id, type, ciphertext, iv, ephemeral_ttl, time, key_version, attachment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  history: db.prepare(
    `SELECT id, conversation_id AS conversationId, sender_id AS senderId,
            (SELECT username FROM users WHERE id = m.sender_id) AS senderName,
            type, ciphertext, iv, ephemeral_ttl, time, key_version, attachment_id AS attachmentId,
            deleted, edited_at
     FROM messages m
     WHERE conversation_id = ?
     ORDER BY time DESC LIMIT ?`
  ),
  lastMsgId: db.prepare(`SELECT MAX(id) AS m FROM messages WHERE conversation_id = ?`),
  countMsgs: db.prepare(`SELECT COUNT(*) AS c FROM messages`),
  countUsers: db.prepare(`SELECT COUNT(*) AS c FROM users`),
  countConvs: db.prepare(`SELECT COUNT(*) AS c FROM conversations`),
  countMsgs24h: db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE time > ?`),
  findUserByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  findUserById: db.prepare(`SELECT id, username, email, locale, public_key, created_at FROM users WHERE id = ?`),
  insertUser: db.prepare(
    `INSERT INTO users (username, password_hash, public_key, locale, created_at) VALUES (?, ?, ?, ?, ?)`
  ),
  updatePublicKey: db.prepare(`UPDATE users SET public_key = ? WHERE id = ?`),
  updatePassword: db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`),
  convById: db.prepare(`SELECT * FROM conversations WHERE id = ?`),
  insertConv: db.prepare(
    `INSERT INTO conversations (type, name, owner_id, created_at) VALUES (?, ?, ?, ?)`
  ),
  addMember: db.prepare(
    `INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`
  ),
  removeMember: db.prepare(`DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?`),
  isMember: db.prepare(`SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?`),
  memberRole: db.prepare(`SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?`),
  // قائمة المحادثات مع عدّاد غير المقروء + آخر نشاط + بيانات الطرف في DM
  convList: db.prepare(`
    SELECT c.id, c.type, c.name, c.owner_id AS ownerId, c.created_at AS createdAt, c.current_key_version AS keyVersion,
           (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS members,
           (SELECT MAX(time) FROM messages WHERE conversation_id = c.id) AS lastTime,
           (SELECT COUNT(*) FROM messages m
             WHERE m.conversation_id = c.id AND m.id > cm.last_read_id AND m.sender_id != cm.user_id) AS unread,
           (SELECT u2.id FROM conversation_members cm2 JOIN users u2 ON u2.id = cm2.user_id
             WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS peerId,
           (SELECT u2.username FROM conversation_members cm2 JOIN users u2 ON u2.id = cm2.user_id
             WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS peerUsername,
           (SELECT u2.public_key FROM conversation_members cm2 JOIN users u2 ON u2.id = cm2.user_id
             WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS peerPublicKey
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
    ORDER BY COALESCE(lastTime, c.created_at) DESC
  `),
  membersOf: db.prepare(`
    SELECT u.id, u.username, u.public_key, cm.role, cm.joined_at
    FROM conversation_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ? ORDER BY cm.joined_at ASC
  `),
  upsertGroupKey: db.prepare(`
    INSERT INTO group_keys (conversation_id, user_id, wrapped_by, wrapped_key, iv, key_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET
      wrapped_by = excluded.wrapped_by,
      wrapped_key = excluded.wrapped_key,
      iv = excluded.iv,
      key_version = excluded.key_version,
      updated_at = excluded.updated_at
  `),
  getGroupKey: db.prepare(`
    SELECT gk.wrapped_key, gk.iv, gk.wrapped_by, gk.key_version, u.public_key AS owner_public_key
    FROM group_keys gk JOIN users u ON u.id = gk.wrapped_by
    WHERE gk.conversation_id = ? AND gk.user_id = ?
  `),
  setKeyVersion: db.prepare(`UPDATE conversations SET current_key_version = ? WHERE id = ?`),
  insertAttachment: db.prepare(
    `INSERT INTO attachments (id, conversation_id, uploader_id, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`
  ),
  getAttachment: db.prepare(`SELECT conversation_id, size_bytes FROM attachments WHERE id = ?`),
  getMessage: db.prepare(`SELECT * FROM messages WHERE id = ?`),
  deleteMessage: db.prepare(`DELETE FROM messages WHERE id = ?`),
  updateMessage: db.prepare(`UPDATE messages SET ciphertext = ?, iv = ?, edited_at = ? WHERE id = ?`),
  deleteGroupKeyForUser: db.prepare(`DELETE FROM group_keys WHERE conversation_id = ? AND user_id = ?`),
  insertStory: db.prepare(
    `INSERT INTO stories (user_id, ciphertext, iv, type, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
  ),
  listStories: db.prepare(`
    SELECT s.id, s.user_id AS userId, u.username, s.ciphertext, s.iv, s.type,
           s.created_at AS createdAt, s.expires_at AS expiresAt
    FROM stories s JOIN users u ON u.id = s.user_id
    WHERE s.expires_at > ? ORDER BY s.created_at DESC
  `),
  upsertKeyBackup: db.prepare(`
    INSERT INTO key_backups (user_id, ciphertext, iv, salt, iterations, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      salt = excluded.salt,
      iterations = excluded.iterations,
      created_at = excluded.created_at
  `),
  getKeyBackup: db.prepare(`SELECT ciphertext, iv, salt, iterations, created_at FROM key_backups WHERE user_id = ?`),
  deleteKeyBackup: db.prepare(`DELETE FROM key_backups WHERE user_id = ?`),
  upsertDeviceToken: db.prepare(`
    INSERT INTO device_tokens (token, user_id, platform, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at
  `),
  deleteDeviceToken: db.prepare(`DELETE FROM device_tokens WHERE token = ?`),
  userTokens: db.prepare(`SELECT token FROM device_tokens WHERE user_id = ?`),
};

// ===== واجهات عامة =====
function saveMessage({ conversationId, userId, type, ciphertext, iv, ephemeralTtl, time, keyVersion, attachmentId }) {
  const info = stmts.insertMessage.run(
    conversationId, userId, type || "text", ciphertext, iv, ephemeralTtl || 0, time, keyVersion || 1, attachmentId || null
  );
  return {
    id: info.lastInsertRowid, conversationId, senderId: userId,
    type: type || "text", ciphertext, iv, time,
    ephemeral_ttl: ephemeralTtl || 0, key_version: keyVersion || 1,
    attachmentId: attachmentId || null,
  };
}

function getHistory(conversationId, limit = 100) {
  return stmts.history.all(conversationId, limit).reverse();
}

function stats() {
  return {
    totalUsers: stmts.countUsers.get().c,
    totalConversations: stmts.countConvs.get().c,
    totalMessages: stmts.countMsgs.get().c,
    messagesLast24h: stmts.countMsgs24h.get(Date.now() - 86400000).c,
  };
}

module.exports = {
  db, dbPath, stmts,
  saveMessage, getHistory, stats,
};
