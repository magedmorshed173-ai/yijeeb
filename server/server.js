const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { db, dbPath, stmts, saveMessage, getHistory, stats } = require("./db");
const { router: authRouter, verifyToken, authRequired } = require("./auth");
const security = require("./security");
const push = require("./push");

push.init();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6,
  pingTimeout: 30000,
});

app.set("trust proxy", 1);
app.use(security.securityHeaders);
app.use(security.requireJson);
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "..", "app"), { maxAge: "1h" }));

// Rate limits
app.use("/api/auth/login", security.authLimiter);
app.use("/api/auth/register", security.authLimiter);
app.use("/api/", security.apiLimiter);
app.use("/api/attachments", security.uploadLimiter);
app.use("/api/auth", authRouter);

// ===== Health + Stats =====
app.get("/health", (_q, res) => res.json({ ok: true, app: "yijeeb-chat", uptime: process.uptime(), ...stats() }));

app.get("/api/stats", (req, res) => {
  const key = req.query.key;
  if (!process.env.STATS_KEY || key !== process.env.STATS_KEY) return res.status(403).json({ error: "forbidden" });
  res.json(stats());
});

// ===== المرفقات =====
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_FILE_SIZE = 30 * 1024 * 1024;

app.post(
  "/api/attachments",
  authRequired,
  express.raw({ type: "application/octet-stream", limit: MAX_FILE_SIZE }),
  (req, res) => {
    const convId = Number(req.query.conversationId);
    if (!Number.isInteger(convId)) return res.status(400).json({ error: "bad convId" });
    if (!stmts.isMember.get(convId, req.user.id)) return res.status(403).json({ error: "forbidden" });
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "empty body" });

    const id = crypto.randomBytes(16).toString("hex");
    fs.writeFileSync(path.join(UPLOAD_DIR, id + ".bin"), req.body);
    stmts.insertAttachment.run(id, convId, req.user.id, req.body.length, Date.now());
    res.json({ id, size: req.body.length });
  }
);

app.get("/api/attachments/:id", authRequired, (req, res) => {
  const row = stmts.getAttachment.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (!stmts.isMember.get(row.conversation_id, req.user.id)) return res.status(403).json({ error: "forbidden" });
  const p = path.join(UPLOAD_DIR, req.params.id + ".bin");
  if (!fs.existsSync(p)) return res.status(410).json({ error: "gone" });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", row.size_bytes);
  res.setHeader("Cache-Control", "private, max-age=86400");
  fs.createReadStream(p).pipe(res);
});

// ===== المحادثات =====
app.get("/api/conversations", authRequired, (req, res) => {
  res.json({ conversations: stmts.convList.all(req.user.id, req.user.id, req.user.id, req.user.id) });
});

app.post("/api/conversations", authRequired, (req, res) => {
  const { type, name, members } = req.body || {};
  if (!["dm", "group", "channel"].includes(type)) return res.status(400).json({ error: "bad type" });

  const info = stmts.insertConv.run(type, name || null, req.user.id, Date.now());
  const cid = info.lastInsertRowid;
  stmts.addMember.run(cid, req.user.id, "owner", Date.now());
  for (const uname of (members || [])) {
    const u = stmts.findUserByUsername.get(uname);
    if (u) stmts.addMember.run(cid, u.id, "member", Date.now());
  }
  res.json({ id: cid });
});

app.get("/api/conversations/:id/messages", authRequired, (req, res) => {
  if (!stmts.isMember.get(req.params.id, req.user.id)) return res.status(403).json({ error: "forbidden" });
  res.json({ messages: getHistory(req.params.id, 100) });
});

app.get("/api/conversations/:id/members", authRequired, (req, res) => {
  if (!stmts.isMember.get(req.params.id, req.user.id)) return res.status(403).json({ error: "forbidden" });
  res.json({ members: stmts.membersOf.all(req.params.id) });
});

app.post("/api/conversations/:id/members", authRequired, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "username required" });
  const role = stmts.memberRole.get(req.params.id, req.user.id);
  if (!role || !["owner", "admin"].includes(role.role)) return res.status(403).json({ error: "not allowed" });

  const target = stmts.findUserByUsername.get(username);
  if (!target) return res.status(404).json({ error: "user not found" });
  if (!target.public_key) return res.status(400).json({ error: "target has no public key" });
  if (stmts.isMember.get(req.params.id, target.id)) return res.status(409).json({ error: "already a member" });

  stmts.addMember.run(req.params.id, target.id, "member", Date.now());
  io.to("conv:" + req.params.id).emit("member:added", { userId: target.id, username: target.username });
  res.json({ ok: true, member: { id: target.id, username: target.username, public_key: target.public_key } });
});

app.delete("/api/conversations/:id/members/:userId", authRequired, (req, res) => {
  const role = stmts.memberRole.get(req.params.id, req.user.id);
  if (!role || !["owner", "admin"].includes(role.role)) return res.status(403).json({ error: "not allowed" });
  const targetId = Number(req.params.userId);
  if (targetId === req.user.id) return res.status(400).json({ error: "cannot remove self" });
  stmts.removeMember.run(req.params.id, targetId);
  stmts.deleteGroupKeyForUser.run(req.params.id, targetId);
  io.to("conv:" + req.params.id).emit("member:removed", { userId: targetId });
  res.json({ ok: true });
});

// ===== Group keys =====
app.post("/api/conversations/:id/group-key/bulk", authRequired, (req, res) => {
  const { entries, key_version } = req.body || {};
  if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ error: "entries required" });
  const version = Number.isInteger(key_version) && key_version > 0 ? key_version : 1;

  const role = stmts.memberRole.get(req.params.id, req.user.id);
  if (!role || !["owner", "admin"].includes(role.role)) return res.status(403).json({ error: "not allowed" });

  const conv = stmts.convById.get(req.params.id);
  if (!conv) return res.status(404).json({ error: "conversation not found" });
  if (version <= conv.current_key_version) {
    return res.status(409).json({ error: "key_version too old", current: conv.current_key_version });
  }

  const memberIds = new Set(stmts.membersOf.all(req.params.id).map((m) => m.id));
  const now = Date.now();

  db.exec("BEGIN");
  try {
    for (const e of entries) {
      if (!memberIds.has(e.userId)) continue;
      if (typeof e.wrapped_key !== "string" || typeof e.iv !== "string") continue;
      stmts.upsertGroupKey.run(req.params.id, e.userId, req.user.id, e.wrapped_key, e.iv, version, now);
    }
    stmts.setKeyVersion.run(version, req.params.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return res.status(500).json({ error: "transaction failed" });
  }

  io.to("conv:" + req.params.id).emit("group-key:updated", { by: req.user.id, key_version: version });
  res.json({ ok: true, updated: entries.length, key_version: version });
});

app.get("/api/conversations/:id/group-key", authRequired, (req, res) => {
  if (!stmts.isMember.get(req.params.id, req.user.id)) return res.status(403).json({ error: "forbidden" });
  const row = stmts.getGroupKey.get(req.params.id, req.user.id);
  const conv = stmts.convById.get(req.params.id);
  res.json({
    ...(row || { wrapped_key: null }),
    current_key_version: conv?.current_key_version || 1,
  });
});

app.get("/api/conversations/:id/key-state", authRequired, (req, res) => {
  if (!stmts.isMember.get(req.params.id, req.user.id)) return res.status(403).json({ error: "forbidden" });
  const conv = stmts.convById.get(req.params.id);
  const mine = db.prepare("SELECT key_version FROM group_keys WHERE conversation_id = ? AND user_id = ?").get(req.params.id, req.user.id);
  res.json({
    current: conv?.current_key_version || 1,
    mine: mine?.key_version || 0,
    up_to_date: (mine?.key_version || 0) === (conv?.current_key_version || 1),
  });
});

// ===== Stories =====
app.post("/api/stories", authRequired, (req, res) => {
  const { ciphertext, iv, type } = req.body || {};
  if (!ciphertext || !iv) return res.status(400).json({ error: "missing" });
  const now = Date.now();
  const info = stmts.insertStory.run(req.user.id, ciphertext, iv, type || "text", now, now + 24 * 3600 * 1000);
  res.json({ id: info.lastInsertRowid });
});

app.get("/api/stories", authRequired, (_req, res) => {
  res.json({ stories: stmts.listStories.all(Date.now()) });
});

// ===== Push (Web Push / VAPID) =====
app.get("/api/push/vapid-public", (_req, res) => {
  const k = push.vapidPublicKey();
  if (!k) return res.status(503).json({ error: "push disabled" });
  res.json({ publicKey: k });
});

app.post("/api/push/subscribe", authRequired, (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription || typeof subscription.endpoint !== "string") {
    return res.status(400).json({ error: "invalid subscription" });
  }
  push.registerSubscription(req.user.id, subscription);
  res.json({ ok: true });
});

app.post("/api/push/unsubscribe", authRequired, (req, res) => {
  const { subscription } = req.body || {};
  if (subscription) push.unregisterSubscription(subscription);
  res.json({ ok: true });
});

// error handler أخيرًا
app.use(security.errorHandler);

// ===== Socket.IO =====
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("unauthorized"));
  const p = verifyToken(token);
  if (!p) return next(new Error("unauthorized"));
  const user = stmts.findUserById.get(p.sub);
  if (!user) return next(new Error("unauthorized"));
  socket.user = user;
  socket._msgCount = 0;
  socket._msgWindow = Date.now();
  next();
});

function checkSocketRate(socket) {
  const now = Date.now();
  if (now - socket._msgWindow > 10000) { socket._msgWindow = now; socket._msgCount = 0; }
  socket._msgCount++;
  if (socket._msgCount > 20) {
    socket.emit("message:rejected", { reason: "rate_limit" });
    return false;
  }
  return true;
}

const presence = new Map(); // userId -> Set(socketId)
function broadcastPresence(userId, online) {
  const convs = db.prepare("SELECT conversation_id FROM conversation_members WHERE user_id = ?").all(userId);
  for (const c of convs) io.to("conv:" + c.conversation_id).emit("presence", { userId, online });
}

io.on("connection", (socket) => {
  const uid = socket.user.id;
  if (!presence.has(uid)) presence.set(uid, new Set());
  presence.get(uid).add(socket.id);
  broadcastPresence(uid, true);

  const convs = db.prepare("SELECT conversation_id FROM conversation_members WHERE user_id = ?").all(uid);
  for (const c of convs) socket.join("conv:" + c.conversation_id);

  socket.emit("presence:init",
    [...presence.keys()].filter(id => id !== uid));

  socket.on("join", ({ conversationId }) => {
    if (stmts.isMember.get(conversationId, uid)) socket.join("conv:" + conversationId);
  });

  socket.on("message", (payload) => {
    if (!checkSocketRate(socket)) return;
    const { conversationId, ciphertext, iv, type, ephemeral_ttl, key_version, attachmentId } = payload || {};
    if (!conversationId || !ciphertext || !iv) return;
    if (!stmts.isMember.get(conversationId, uid)) return;

    const conv = stmts.convById.get(conversationId);
    if (!conv) return;

    if (conv.type !== "dm") {
      const kv = Number.isInteger(key_version) ? key_version : 1;
      if (kv !== conv.current_key_version) {
        socket.emit("message:rejected", { conversationId, reason: "key_version_mismatch", expected: conv.current_key_version, got: kv });
        return;
      }
    }

    if (attachmentId) {
      const att = stmts.getAttachment.get(attachmentId);
      if (!att || att.conversation_id !== conversationId) {
        socket.emit("message:rejected", { conversationId, reason: "bad_attachment" });
        return;
      }
    }

    const saved = saveMessage({
      conversationId, userId: uid, type: type || "text",
      ciphertext, iv, ephemeralTtl: ephemeral_ttl || 0,
      time: Date.now(), keyVersion: key_version || 1, attachmentId,
    });
    saved.senderName = socket.user.username;
    io.to("conv:" + conversationId).emit("message", saved);

    if (saved.ephemeral_ttl > 0) {
      setTimeout(() => {
        stmts.deleteMessage.run(saved.id);
        io.to("conv:" + conversationId).emit("message:deleted", { id: saved.id });
      }, saved.ephemeral_ttl * 1000);
    }

    // Push لغير المتصلين
    const members = db.prepare(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?"
    ).all(conversationId, uid);
    const onlineUserIds = new Set();
    for (const [, s] of io.sockets.sockets) {
      if (s.user) onlineUserIds.add(s.user.id);
    }
    for (const m of members) {
      if (onlineUserIds.has(m.user_id)) continue;
      push.sendToUser(m.user_id, {
        title: socket.user.username,
        body: saved.type === "text" ? "أرسل رسالة جديدة" : "أرسل مرفقًا",
        data: { conversationId: String(conversationId), messageId: String(saved.id) },
      });
    }
  });

  socket.on("message:delete", ({ messageId }) => {
    if (!Number.isInteger(messageId)) return;
    const row = stmts.getMessage.get(messageId);
    if (!row) return;
    if (row.sender_id !== uid) {
      socket.emit("message:rejected", { reason: "not_owner" });
      return;
    }
    stmts.deleteMessage.run(messageId);
    io.to("conv:" + row.conversation_id).emit("message:deleted", { id: messageId });
  });

  socket.on("message:edit", ({ messageId, ciphertext, iv }) => {
    if (!Number.isInteger(messageId) || !ciphertext || !iv) return;
    const row = stmts.getMessage.get(messageId);
    if (!row) return;
    if (row.sender_id !== uid) return socket.emit("message:rejected", { reason: "not_owner" });
    if (row.type !== "text") return socket.emit("message:rejected", { reason: "cannot_edit_file" });
    const now = Date.now();
    stmts.updateMessage.run(ciphertext, iv, now, messageId);
    io.to("conv:" + row.conversation_id).emit("message:edited", {
      id: messageId, ciphertext, iv, edited_at: now,
    });
  });

  socket.on("typing", ({ conversationId, isTyping }) => {
    socket.to("conv:" + conversationId).emit("typing", {
      conversationId, userId: uid, name: socket.user.username, isTyping: !!isTyping,
    });
  });

  socket.on("read", ({ conversationId, messageId }) => {
    db.prepare("UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?")
      .run(messageId, conversationId, uid);
    socket.to("conv:" + conversationId).emit("read", { conversationId, userId: uid, messageId });
  });

  socket.on("disconnect", () => {
    presence.get(uid)?.delete(socket.id);
    if (presence.get(uid)?.size === 0) { presence.delete(uid); broadcastPresence(uid, false); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Yijeeb chat on http://localhost:${PORT}`);
  console.log(`DB: ${dbPath}`);
});
