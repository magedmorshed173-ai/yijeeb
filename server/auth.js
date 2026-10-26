const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { stmts } = require("./db");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-change-me";
const JWT_EXPIRES = "30d";

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  console.error("FATAL: JWT_SECRET must be set in production");
  process.exit(1);
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: "unauthorized" });
  const p = verifyToken(t);
  if (!p) return res.status(401).json({ error: "unauthorized" });
  const user = stmts.findUserById.get(p.sub);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}

router.post("/register", async (req, res) => {
  const { username, password, publicKey, locale } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "invalid payload" });
  }
  const u = username.trim();
  if (!USERNAME_RE.test(u)) return res.status(400).json({ error: "bad username" });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ error: "bad password" });
  if (typeof publicKey !== "string" || publicKey.length < 80) return res.status(400).json({ error: "public key required" });

  if (stmts.findUserByUsername.get(u)) return res.status(409).json({ error: "username taken" });

  const hash = await bcrypt.hash(password, 10);
  let info;
  try {
    info = stmts.insertUser.run(u, hash, publicKey, locale || "ar", Date.now());
  } catch (e) {
    return res.status(409).json({ error: "username taken" });
  }
  const user = stmts.findUserById.get(info.lastInsertRowid);
  res.json({ token: signToken(user), user });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "invalid payload" });
  }
  const row = stmts.findUserByUsername.get(username.trim());
  if (!row) return res.status(401).json({ error: "wrong credentials" });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: "wrong credentials" });
  const user = { id: row.id, username: row.username, locale: row.locale, public_key: row.public_key, created_at: row.created_at };
  res.json({ token: signToken(user), user });
});

router.get("/me", authRequired, (req, res) => res.json({ user: req.user }));

router.get("/users/:username", authRequired, (req, res) => {
  const u = stmts.findUserByUsername.get(req.params.username);
  if (!u) return res.status(404).json({ error: "not found" });
  res.json({ user: { id: u.id, username: u.username, public_key: u.public_key } });
});

router.post("/update-public-key", authRequired, (req, res) => {
  const { publicKey } = req.body || {};
  if (typeof publicKey !== "string" || publicKey.length < 80) return res.status(400).json({ error: "invalid" });
  stmts.updatePublicKey.run(publicKey, req.user.id);
  res.json({ ok: true });
});

router.post("/change-password", authRequired, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (typeof oldPassword !== "string" || typeof newPassword !== "string") return res.status(400).json({ error: "invalid" });
  if (newPassword.length < 6 || newPassword.length > 72) return res.status(400).json({ error: "bad password" });
  const row = stmts.findUserByUsername.get(req.user.username);
  const ok = await bcrypt.compare(oldPassword, row.password_hash);
  if (!ok) return res.status(401).json({ error: "wrong password" });
  stmts.updatePassword.run(await bcrypt.hash(newPassword, 10), req.user.id);
  res.json({ ok: true });
});

// ===== Key Backup =====
router.post("/key-backup", authRequired, (req, res) => {
  const { ciphertext, iv, salt, iterations } = req.body || {};
  if (typeof ciphertext !== "string" || typeof iv !== "string" || typeof salt !== "string") {
    return res.status(400).json({ error: "invalid payload" });
  }
  if (!Number.isInteger(iterations) || iterations < 100000) return res.status(400).json({ error: "iterations too low" });
  stmts.upsertKeyBackup.run(req.user.id, ciphertext, iv, salt, iterations, Date.now());
  res.json({ ok: true });
});

router.get("/key-backup", authRequired, (req, res) => {
  const row = stmts.getKeyBackup.get(req.user.id);
  if (!row) return res.status(404).json({ error: "no backup" });
  res.json(row);
});

router.delete("/key-backup", authRequired, (req, res) => {
  stmts.deleteKeyBackup.run(req.user.id);
  res.json({ ok: true });
});

module.exports = { router, verifyToken, JWT_SECRET, authRequired };
