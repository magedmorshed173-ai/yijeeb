const $ = (id) => document.getElementById(id);
const state = {
  token: localStorage.getItem("yijeeb_token"),
  user: null,
  socket: null,
  myKeys: null,
  convs: [],
  activeConv: null,
  activeKey: null,
  activeKeyVersion: 1,
  envCache: new Map(),
  online: new Set(),
  replyTo: null,
  locale: localStorage.getItem("yijeeb_locale") || "ar",
};
window.state = state;
applyI18n(state.locale);
document.documentElement.dataset.theme = localStorage.getItem("yijeeb_theme") || "dark";

// ===== IndexedDB =====
async function idbPut(key, val) {
  return new Promise((res, rej) => {
    const req = indexedDB.open("yijeeb", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => {
      const tx = req.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put(val, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
}
async function idbGet(key) {
  return new Promise((res, rej) => {
    const req = indexedDB.open("yijeeb", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => {
      const tx = req.result.transaction("kv", "readonly");
      const g = tx.objectStore("kv").get(key);
      g.onsuccess = () => res(g.result);
      g.onerror = () => rej(g.error);
    };
    req.onerror = () => rej(req.error);
  });
}

// ===== API =====
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  const r = await fetch(path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

// ===== helpers =====
const AV_COLORS = ["#0D9488", "#0F766E", "#115e59", "#14b8a6", "#0d7490", "#047857", "#0f766e", "#025e56"];
function avColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function makeAvatar(name, sm) {
  const d = document.createElement("div");
  d.className = "avatar" + (sm ? " sm" : "");
  d.style.background = avColor(name);
  d.textContent = (name || "?").slice(0, 2).toUpperCase();
  return d;
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(state.locale, { hour: "2-digit", minute: "2-digit" });
}
function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}
function fmtDur(s) { return Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0"); }
function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
function trError(m) {
  const map = {
    "wrong credentials": "errWrongCreds", "username taken": "errNameTaken",
    "too many attempts": "errMany", "unauthorized": "errSession",
  };
  if (map[m]) return t(map[m]);
  if (m.includes("bad username")) return t("errName");
  if (m.includes("bad password")) return t("errPass");
  return m;
}

// ===== envelope E2EE =====
async function sealEnvelope(obj) {
  return YijCrypto.encrypt(state.activeKey, JSON.stringify(obj));
}
async function openEnvelope(m) {
  if (state.envCache.has(m.id)) return state.envCache.get(m.id);
  if (!state.activeKey) return null;
  try {
    const env = JSON.parse(await YijCrypto.decrypt(state.activeKey, m.ciphertext, m.iv));
    state.envCache.set(m.id, env);
    return env;
  } catch { return null; }
}

// ===== AUTH =====
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.mode = tab.dataset.mode;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === tab));
    $("auth-submit").textContent = state.mode === "login" ? t("login") : t("register");
    $("password").autocomplete = state.mode === "login" ? "current-password" : "new-password";
    $("auth-error").textContent = "";
  });
});
state.mode = "login";

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("auth-error").textContent = "";
  $("auth-submit").disabled = true;
  state.locale = $("locale").value;
  localStorage.setItem("yijeeb_locale", state.locale);
  applyI18n(state.locale);
  try {
    const kp = await YijCrypto.genKeypair();
    state.myKeys = kp;
    await idbPut("myKeypair", kp);
    const path = state.mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = { username: $("username").value.trim(), password: $("password").value };
    if (state.mode === "register") { body.publicKey = kp.publicKey; body.locale = state.locale; }
    const data = await api(path, { method: "POST", body: JSON.stringify(body) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("yijeeb_token", data.token);
    if (state.mode === "register") {
      const code = YijCrypto.generateRecoveryCode();
      const backup = await YijCrypto.createKeyBackup(code, kp);
      await api("/api/auth/key-backup", { method: "POST", body: JSON.stringify(backup) });
      showRecoveryCode(code);
    } else if (!state.myKeys) {
      await promptRestore();
    }
    await enterApp();
  } catch (err) {
    $("auth-error").textContent = trError(err.message);
  } finally {
    $("auth-submit").disabled = false;
  }
});

function showRecoveryCode(code) {
  $("recovery-display").textContent = code;
  $("recovery-modal").classList.remove("hidden");
  $("ack-recovery").checked = false;
  $("confirm-recovery").disabled = true;
  $("copy-recovery").onclick = () => {
    navigator.clipboard.writeText(code);
    $("copy-recovery").textContent = t("copied");
    setTimeout(() => ($("copy-recovery").textContent = t("copy")), 1500);
  };
  $("ack-recovery").onchange = (e) => ($("confirm-recovery").disabled = !e.target.checked);
  $("confirm-recovery").onclick = () => $("recovery-modal").classList.add("hidden");
}

async function promptRestore() {
  const code = prompt(t("restoreQ"));
  if (!code) {
    const kp = await YijCrypto.genKeypair();
    state.myKeys = kp;
    await idbPut("myKeypair", kp);
    await api("/api/auth/update-public-key", { method: "POST", body: JSON.stringify({ publicKey: kp.publicKey }) }).catch(() => {});
    return;
  }
  try {
    const backup = await api("/api/auth/key-backup");
    const keys = await YijCrypto.restoreFromBackup(code.trim(), backup);
    state.myKeys = keys;
    await idbPut("myKeypair", keys);
  } catch { alert(t("restoreFail")); }
}

// ===== APP =====
async function enterApp() {
  $("auth").classList.add("hidden");
  $("chat").classList.remove("hidden");
  $("me").textContent = "@" + state.user.username;
  if (!state.myKeys) state.myKeys = await idbGet("myKeypair");
  applyI18n(state.locale);
  connectSocket();
  await loadConversations();
}

function leaveApp() {
  if (state.socket) state.socket.disconnect();
  state.socket = null; state.token = null; state.user = null;
  state.envCache.clear(); state.online.clear();
  localStorage.removeItem("yijeeb_token");
  $("messages").innerHTML = "";
  $("chat").classList.add("hidden");
  $("auth").classList.remove("hidden");
}

// ===== SOCKET =====
function connectSocket() {
  if (state.socket) state.socket.disconnect();
  state.socket = io({ auth: { token: state.token } });

  state.socket.on("connect", () => { $("status").textContent = t("connected"); });
  state.socket.on("connect_error", (err) => {
    if (err.message === "unauthorized") leaveApp();
    else $("status").textContent = t("connErr");
  });
  state.socket.on("disconnect", () => ($("status").textContent = t("disconnected")));

  state.socket.on("presence:init", (ids) => { state.online = new Set(ids); updateDmStatus(); });
  state.socket.on("presence", ({ userId, online }) => {
    if (online) state.online.add(userId); else state.online.delete(userId);
    updateDmStatus();
  });

  state.socket.on("message", async (msg) => {
    updateConvBump(msg);
    if (!state.activeConv || msg.conversationId !== state.activeConv.id) return;
    const env = await openEnvelope(msg);
    renderEnvelope(msg, env);
    markRead();
  });

  state.socket.on("message:deleted", ({ id }) => {
    const el = document.querySelector(`[data-mid="${id}"]`);
    if (el) { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }
    state.envCache.delete(id);
  });

  state.socket.on("message:edited", async ({ id, ciphertext, iv }) => {
    const el = document.querySelector(`[data-mid="${id}"]`);
    if (!el || !state.activeKey) return;
    try {
      const env = JSON.parse(await YijCrypto.decrypt(state.activeKey, ciphertext, iv));
      state.envCache.set(id, env);
      const span = el.querySelector(".text");
      if (span) span.textContent = env.x || "";
    } catch {}
  });

  state.socket.on("typing", ({ name, isTyping, conversationId }) => {
    if (state.activeConv?.id === conversationId)
      $("typing").textContent = isTyping ? `${name} ${t("typing")}` : "";
  });

  state.socket.on("read", ({ conversationId, userId, messageId }) => {
    if (state.activeConv?.id !== conversationId || userId === state.user.id) return;
    document.querySelectorAll("#messages .msg.mine small").forEach((s) => {
      if (!s.textContent.includes("✓✓")) s.textContent += " ✓✓";
    });
  });

  state.socket.on("message:rejected", async ({ reason }) => {
    if (reason === "key_version_mismatch" && state.activeConv) {
      state.activeKey = null;
      await ensureGroupKey(state.activeConv);
      $("typing").textContent = t("keyUpdated");
      setTimeout(() => ($("typing").textContent = ""), 2000);
    }
  });

  state.socket.on("group-key:updated", async ({ by }) => {
    if (!state.activeConv || by === state.user.id) return;
    state.activeKey = null;
    await ensureGroupKey(state.activeConv);
  });
}

function updateDmStatus() {
  const c = state.activeConv;
  if (!c || c.type !== "dm") return;
  $("status").textContent = state.online.has(c.peerId) ? t("online") : t("offline");
}

function updateConvBump(msg) {
  const conv = state.convs.find((c) => c.id === msg.conversationId);
  if (!conv) return;
  conv.lastTime = msg.time;
  if (!state.activeConv || conv.id !== state.activeConv.id || msg.senderId === state.user.id) {
    conv.unread = (conv.unread || 0) + 1;
  }
  state.convs.sort((a, b) => (b.lastTime || b.createdAt) - (a.lastTime || a.createdAt));
  renderList();
}

// ===== CONVERSATIONS =====
async function loadConversations() {
  const { conversations } = await api("/api/conversations");
  state.convs = conversations;
  renderList();
}

function convTitle(c) {
  return c.type === "dm" ? (c.peerUsername || "DM") : (c.name || t("dm"));
}

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  if (!state.convs.length) {
    list.innerHTML = `<p class="empty">${t("emptyConvs")}</p>`;
    return;
  }
  for (const c of state.convs) {
    const el = document.createElement("div");
    el.className = "conv";
    el.appendChild(makeAvatar(convTitle(c)));
    const body = document.createElement("div");
    body.className = "conv-body";
    const top = document.createElement("div"); top.className = "conv-top";
    const b = document.createElement("b"); b.textContent = (c.type === "channel" ? "📢 " : c.type === "group" ? "👥 " : "") + convTitle(c);
    const time = document.createElement("time"); time.textContent = c.lastTime ? fmtTime(c.lastTime) : "";
    top.append(b, time);
    const bottom = document.createElement("div"); bottom.className = "conv-bottom";
    const sub = document.createElement("small");
    sub.textContent = c.type === "dm" ? t("dm") : t("membersCount", c.members);
    bottom.appendChild(sub);
    if (c.unread > 0 && c.id !== state.activeConv?.id) {
      const bd = document.createElement("span"); bd.className = "badge"; bd.textContent = c.unread;
      bottom.appendChild(bd);
    }
    body.append(top, bottom);
    el.appendChild(body);
    el.addEventListener("click", () => openConversation(c));
    list.appendChild(el);
  }
}

async function openConversation(conv) {
  state.activeConv = conv;
  state.activeKey = null;
  state.replyTo = null;
  $("reply-bar").classList.add("hidden");
  $("list").classList.add("hidden");
  $("chat-area").classList.remove("hidden");
  $("back").classList.remove("hidden");
  $("room-title").textContent = convTitle(conv);
  $("rotate-key").classList.toggle("hidden", conv.type === "dm");
  $("messages").innerHTML = "";
  $("typing").textContent = "";
  $("room-avatar").classList.remove("hidden");
  $("room-avatar").replaceWith(makeAvatar(convTitle(conv)));
  $("room-avatar").id = "room-avatar";

  state.socket.emit("join", { conversationId: conv.id });

  if (conv.type === "dm") {
    updateDmStatus();
    if (conv.peerPublicKey) {
      state.activeKey = await YijCrypto.deriveShared(state.myKeys.privateKey, conv.peerPublicKey);
    }
  } else {
    $("status").textContent = t("membersCount", conv.members);
    await ensureGroupKey(conv);
  }

  const { messages } = await api(`/api/conversations/${conv.id}/messages`);
  for (const m of messages) {
    const env = await openEnvelope(m);
    renderEnvelope(m, env);
  }
  markRead();
  $("msg-input").focus();
}

function markRead() {
  const msgs = $("messages").querySelectorAll(".msg");
  const last = msgs.length ? Number(msgs[msgs.length - 1].dataset.mid) : 0;
  if (last) state.socket.emit("read", { conversationId: state.activeConv.id, messageId: last });
  const conv = state.convs.find((c) => c.id === state.activeConv.id);
  if (conv) conv.unread = 0;
}

async function ensureGroupKey(conv) {
  if (state.activeKey) return;
  try {
    const payload = await api(`/api/conversations/${conv.id}/group-key`);
    if (!payload.wrapped_key) return;
    state.activeKey = await YijCrypto.unwrapGroupKey(payload, state.myKeys.privateKey, payload.owner_public_key);
    state.activeKeyVersion = payload.key_version;
  } catch (e) { console.error("unwrap failed:", e); }
}

// ===== RENDER =====
function renderEnvelope(m, env) {
  if (!env) { appendLocked(m); return; }
  if (env.k === "voice") appendVoice(m, env);
  else if (env.k === "file") appendFile(m, env);
  else appendText(m, env);
}

function addQuote(div, env) {
  if (!env.r) return;
  const q = document.createElement("div");
  q.className = "quote";
  const b = document.createElement("b"); b.textContent = env.r.n;
  const s = document.createElement("span"); s.textContent = env.r.p || "";
  q.append(b, s);
  div.appendChild(q);
  div.addEventListener("click", (e) => {
    if (e.target.closest("a,button")) return;
    const target = document.querySelector(`[data-mid="${env.r.id}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.style.transition = "box-shadow .3s";
      target.style.boxShadow = "0 0 0 2px var(--mint)";
      setTimeout(() => (target.style.boxShadow = ""), 1200);
    }
  });
}

function appendLocked(m) {
  const div = document.createElement("div");
  const mine = m.senderId === state.user.id;
  div.className = "msg " + (mine ? "mine" : "other");
  div.dataset.mid = m.id;
  const span = document.createElement("span"); span.className = "text"; span.textContent = "🔒";
  const small = document.createElement("small"); small.textContent = fmtTime(m.time);
  div.append(span, small);
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
}

function appendText(m, env) {
  const mine = m.senderId === state.user.id;
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "other");
  div.dataset.mid = m.id;
  if (!mine) {
    const who = document.createElement("div"); who.className = "who"; who.textContent = m.senderName;
    div.appendChild(who);
  }
  addQuote(div, env);
  const span = document.createElement("span"); span.className = "text"; span.textContent = env.x || "";
  const small = document.createElement("small");
  small.textContent = fmtTime(m.time) + (m.edited_at ? " • " + t("edited") : "") + (mine ? " ✓" : "");
  div.append(span, small);
  if (mine) {
    div.addEventListener("contextmenu", (e) => { e.preventDefault(); showMsgMenu(m, env, div); });
  } else {
    div.addEventListener("contextmenu", (e) => { e.preventDefault(); showReplyMenu(m, env); });
  }
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
}

function appendFile(m, env) {
  const mine = m.senderId === state.user.id;
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "other");
  div.dataset.mid = m.id;
  if (!mine) {
    const who = document.createElement("div"); who.className = "who"; who.textContent = m.senderName;
    div.appendChild(who);
  }
  addQuote(div, env);
  const att = document.createElement("div");
  att.className = "attachment";
  att.innerHTML = `<div class="file-card"><span class="f-ico">⏳</span><div class="meta"><b></b><small>${t("downloading")}</small></div></div>`;
  att.querySelector("b").textContent = env.filename;
  const small = document.createElement("small"); small.textContent = fmtTime(m.time) + (mine ? " ✓" : "");
  div.append(att, small);
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;

  loadAttachment(env, att).catch(() => {
    att.innerHTML = `<div class="file-card"><span class="f-ico">❌</span><div class="meta"><b></b><small>${t("fileFailed")}</small></div></div>`;
    att.querySelector("b").textContent = env.filename;
  });
}

function appendVoice(m, env) {
  const mine = m.senderId === state.user.id;
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "other");
  div.dataset.mid = m.id;
  if (!mine) {
    const who = document.createElement("div"); who.className = "who"; who.textContent = m.senderName;
    div.appendChild(who);
  }
  addQuote(div, env);
  const row = document.createElement("div"); row.className = "voice-row";
  const play = document.createElement("button"); play.className = "play-btn"; play.textContent = "▶";
  const wave = document.createElement("div"); wave.className = "v-wave";
  let seed = m.id * 7919 + 13;
  for (let i = 0; i < 20; i++) {
    const bar = document.createElement("i");
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    bar.style.height = (5 + (seed % 15)) + "px";
    wave.appendChild(bar);
  }
  const dur = document.createElement("span"); dur.className = "v-dur"; dur.textContent = fmtDur(env.dur || 0);
  row.append(play, wave, dur);
  const small = document.createElement("small"); small.textContent = fmtTime(m.time) + (mine ? " ✓" : "");
  div.append(row, small);
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;

  loadAttachment(env, null, async (audioBuf) => {
    const blob = new Blob([audioBuf], { type: env.mime || "audio/webm" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    let playing = false;
    play.onclick = () => {
      if (playing) { audio.pause(); play.textContent = "▶"; playing = false; return; }
      audio.play(); play.textContent = "⏸"; playing = true;
    };
    audio.onended = () => { play.textContent = "▶"; playing = false; };
    audio.onerror = () => { play.textContent = "✕"; play.disabled = true; };
  });
}

async function loadAttachment(env, container, onBuf) {
  const res = await fetch(`/api/attachments/${env.attachmentId}`, { headers: { Authorization: "Bearer " + state.token } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const ctBuf = await res.arrayBuffer();
  const ptBuf = await YijCrypto.decryptFile(state.activeKey, ctBuf, env.fileIv);
  if (onBuf) return onBuf(ptBuf);
  const blob = new Blob([ptBuf], { type: env.mime });
  const url = URL.createObjectURL(blob);
  container.innerHTML = "";
  if (env.mime.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = url; img.alt = env.filename;
    img.onclick = () => window.open(url, "_blank");
    container.appendChild(img);
  } else if (env.mime.startsWith("video/")) {
    const v = document.createElement("video"); v.src = url; v.controls = true; container.appendChild(v);
  } else {
    const a = document.createElement("a");
    a.className = "file-card"; a.href = url; a.download = env.filename;
    a.innerHTML = `<span class="f-ico">📄</span><div class="meta"><b></b><small></small></div>`;
    a.querySelector("b").textContent = env.filename;
    a.querySelector("small").textContent = fmtSize(env.size || 0) + " — " + t("pressToDownload");
    container.appendChild(a);
  }
}

// ===== msg menus =====
function placeMenu(menu, anchorEl) {
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 140) + "px";
  menu.style.right = "16px";
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
}
function showReplyMenu(m, env) {
  document.querySelectorAll(".msg-menu").forEach((e) => e.remove());
  const menu = document.createElement("div"); menu.className = "msg-menu";
  const btn = document.createElement("button");
  btn.textContent = "↩ " + t("replyMsg");
  btn.onclick = () => { menu.remove(); setReply(m, env); };
  menu.appendChild(btn);
  placeMenu(menu, document.querySelector(`[data-mid="${m.id}"]`));
}
function showMsgMenu(m, env, msgEl) {
  document.querySelectorAll(".msg-menu").forEach((e) => e.remove());
  const menu = document.createElement("div"); menu.className = "msg-menu";
  const replyBtn = document.createElement("button");
  replyBtn.textContent = "↩ " + t("replyMsg");
  replyBtn.onclick = () => { menu.remove(); setReply(m, env); };
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "⧉ " + t("copyMsg");
  copyBtn.onclick = () => { menu.remove(); navigator.clipboard.writeText(env.x || ""); };
  const editBtn = document.createElement("button");
  editBtn.textContent = "✏ " + t("editMsg");
  editBtn.onclick = () => { menu.remove(); editMessage(m, env, msgEl); };
  const delBtn = document.createElement("button");
  delBtn.textContent = "🗑 " + t("delMsg");
  delBtn.className = "danger";
  delBtn.onclick = () => {
    menu.remove();
    if (confirm(t("delConfirm"))) state.socket.emit("message:delete", { messageId: m.id });
  };
  menu.append(replyBtn, copyBtn, editBtn, delBtn);
  placeMenu(menu, msgEl);
}
function setReply(m, env) {
  state.replyTo = { id: m.id, n: m.senderName, p: (env.x || env.filename || "").slice(0, 80) };
  $("reply-name").textContent = t("replyTo") + ": " + m.senderName;
  $("reply-peek").textContent = state.replyTo.p;
  $("reply-bar").classList.remove("hidden");
  $("msg-input").focus();
}
$("reply-cancel").addEventListener("click", () => {
  state.replyTo = null;
  $("reply-bar").classList.add("hidden");
});
async function editMessage(m, env, msgEl) {
  const current = msgEl.querySelector(".text")?.textContent || "";
  const newText = prompt(t("editPrompt"), current);
  if (!newText || newText === current || !state.activeKey) return;
  const newEnv = { k: "text", x: newText.trim(), r: env.r || null };
  const { ciphertext, iv } = await YijCrypto.encrypt(state.activeKey, JSON.stringify(newEnv));
  state.socket.emit("message:edit", { messageId: m.id, ciphertext, iv });
}

// ===== SEND =====
$("send-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("msg-input").value.trim();
  if (!text || !state.activeKey || !state.activeConv) return;
  const env = { k: "text", x: text, r: state.replyTo || null };
  const { ciphertext, iv } = await sealEnvelope(env);
  state.socket.emit("message", {
    conversationId: state.activeConv.id, ciphertext, iv, type: "text",
    key_version: state.activeConv.type === "dm" ? 1 : (state.activeKeyVersion || 1),
  });
  $("msg-input").value = "";
  state.replyTo = null;
  $("reply-bar").classList.add("hidden");
});

let typingDebounce = null;
$("msg-input").addEventListener("input", () => {
  if (!state.activeConv) return;
  state.socket.emit("typing", { conversationId: state.activeConv.id, isTyping: true });
  clearTimeout(typingDebounce);
  typingDebounce = setTimeout(() => state.socket.emit("typing", { conversationId: state.activeConv.id, isTyping: false }), 1500);
});

// ===== SEARCH =====
$("search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  let any = false;
  document.querySelectorAll("#messages .msg").forEach((el) => {
    const hit = !q || el.textContent.toLowerCase().includes(q);
    el.style.display = hit ? "" : "none";
    if (hit && q) any = true;
  });
  if (q && !any && $("messages").children.length) {
    // لا نتائج — لا نحذف شيئًا، فقط الفلاتر تخفي
  }
});

// ===== ATTACH =====
$("attach-btn").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  $("file-input").value = "";
  if (file) sendFile(file, "file");
});

async function sendFile(file, kind, extra = {}) {
  if (!state.activeKey || !state.activeConv) return alert(t("keyNotReady"));
  if (file.size > 30 * 1024 * 1024) return alert(t("sizeLimit"));
  try {
    $("upload-status").classList.remove("hidden");
    $("upload-label").textContent = (kind === "voice" ? t("voice") : file.name) + " …";
    $("upload-progress").style.width = "5%";
    const buf = kind === "voice" ? file : await file.arrayBuffer();
    const { ciphertext, iv: fileIv } = await YijCrypto.encryptFile(state.activeKey, buf);
    $("upload-progress").style.width = "20%";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/attachments?conversationId=${state.activeConv.id}`);
    xhr.setRequestHeader("Authorization", "Bearer " + state.token);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) $("upload-progress").style.width = (20 + Math.round((ev.loaded / ev.total) * 70)) + "%";
    };
    const attachmentId = await new Promise((resolve, reject) => {
      xhr.onload = () => {
        try {
          const d = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(d.id);
          else reject(new Error(d.error || "upload failed"));
        } catch { reject(new Error("bad response")); }
      };
      xhr.onerror = () => reject(new Error("network error"));
      xhr.send(ciphertext);
    });

    const env = {
      k: kind, filename: file.name || (kind === "voice" ? "voice.webm" : "file"),
      mime: file.type || "application/octet-stream", size: file.size,
      attachmentId, fileIv, ...extra,
    };
    const { ciphertext: msgCt, iv: msgIv } = await YijCrypto.encrypt(state.activeKey, JSON.stringify({ ...env, k: kind }));
    state.socket.emit("message", {
      conversationId: state.activeConv.id, ciphertext: msgCt, iv: msgIv, type: kind,
      attachmentId, key_version: state.activeConv.type === "dm" ? 1 : (state.activeKeyVersion || 1),
    });
    $("upload-progress").style.width = "100%";
    setTimeout(() => $("upload-status").classList.add("hidden"), 400);
  } catch (err) {
    alert("✗ " + err.message);
    $("upload-status").classList.add("hidden");
  }
}

// ===== VOICE NOTES =====
let mediaRec = null, recChunks = [], recTimer = null, recStart = 0;
$("mic-btn").addEventListener("click", async () => {
  if (mediaRec) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    mediaRec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recChunks = [];
    mediaRec.ondataavailable = (e) => recChunks.push(e.data);
    mediaRec.start();
    recStart = Date.now();
    $("rec-bar").classList.remove("hidden");
    $("send-form").style.display = "none";
    recTimer = setInterval(() => ($("rec-time").textContent = fmtDur((Date.now() - recStart) / 1000)), 300);
  } catch { alert(t("micDenied")); }
});
$("rec-cancel").addEventListener("click", () => stopRecording(false));
$("rec-send").addEventListener("click", () => stopRecording(true));
function stopRecording(send) {
  if (!mediaRec) return;
  const dur = (Date.now() - recStart) / 1000;
  clearInterval(recTimer);
  const rec = mediaRec;
  mediaRec = null;
  rec.onstop = async () => {
    rec.stream.getTracks().forEach((tr) => tr.stop());
    $("rec-bar").classList.add("hidden");
    $("send-form").style.display = "";
    if (!send) return;
    const blob = new Blob(recChunks, { type: rec.mimeType || "audio/webm" });
    if (blob.size < 800) return;
    const file = new File([blob], "voice.webm", { type: rec.mimeType || "audio/webm" });
    await sendFile(file, "voice", { dur: Math.max(1, Math.round(dur)) });
  };
  rec.stop();
}

// ===== NEW CHAT =====
$("new-chat").addEventListener("click", () => {
  const choice = prompt(t("newChatQ"));
  if (choice === "1") {
    const username = prompt(t("usernameQ"));
    if (username) createDM(username.trim());
  } else if (choice === "2") {
    $("group-modal").classList.remove("hidden");
  }
});

async function createDM(username) {
  try {
    if (username.toLowerCase() === state.user.username.toLowerCase()) return;
    const existing = state.convs.find((c) => c.type === "dm" && c.peerUsername?.toLowerCase() === username.toLowerCase());
    if (existing) return openConversation(existing);
    const { id } = await api("/api/conversations", { method: "POST", body: JSON.stringify({ type: "dm", members: [username] }) });
    await loadConversations();
    const conv = state.convs.find((c) => c.id === id);
    if (conv) openConversation(conv);
  } catch (err) { alert(trError(err.message)); }
}

$("close-group-modal").addEventListener("click", () => $("group-modal").classList.add("hidden"));
$("group-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("group-name").value.trim();
  const usernames = $("group-members").value.split(",").map((s) => s.trim()).filter(Boolean);
  const type = $("group-type").value;
  $("group-modal").classList.add("hidden");
  try {
    const { id } = await api("/api/conversations", { method: "POST", body: JSON.stringify({ type, name, members: [] }) });
    const added = [];
    for (const u of usernames) {
      try { const r = await api(`/api/conversations/${id}/members`, { method: "POST", body: JSON.stringify({ username: u }) }); added.push(r.member); } catch {}
    }
    const groupKey = await YijCrypto.generateGroupKey();
    const entries = [];
    const selfEntry = await YijCrypto.wrapGroupKeyForMember(groupKey, state.myKeys.privateKey, state.myKeys.publicKey);
    entries.push({ userId: state.user.id, ...selfEntry });
    for (const m of added) {
      if (!m.public_key) continue;
      const w = await YijCrypto.wrapGroupKeyForMember(groupKey, state.myKeys.privateKey, m.public_key);
      entries.push({ userId: m.id, ...w });
    }
    await api(`/api/conversations/${id}/group-key/bulk`, { method: "POST", body: JSON.stringify({ entries, key_version: 2 }) });
    await loadConversations();
    const conv = state.convs.find((c) => c.id === id);
    if (conv) { state.activeKey = groupKey; state.activeKeyVersion = 2; openConversation(conv); }
  } catch (err) { alert("✗ " + err.message); }
});

// ===== ROTATE KEY =====
$("rotate-key").addEventListener("click", async () => {
  if (!state.activeConv || state.activeConv.type === "dm") return;
  if (!confirm("🔄?")) return;
  try {
    const { members } = await api(`/api/conversations/${state.activeConv.id}/members`);
    const newKey = await YijCrypto.generateGroupKey();
    const entries = [];
    for (const m of members) {
      if (!m.public_key) continue;
      const w = await YijCrypto.wrapGroupKeyForMember(newKey, state.myKeys.privateKey, m.public_key);
      entries.push({ userId: m.id, ...w });
    }
    const st = await api(`/api/conversations/${state.activeConv.id}/key-state`);
    const v = st.current + 1;
    await api(`/api/conversations/${state.activeConv.id}/group-key/bulk`, { method: "POST", body: JSON.stringify({ entries, key_version: v }) });
    state.activeKey = newKey;
    state.activeKeyVersion = v;
  } catch (e) { alert("✗ " + e.message); }
});

// ===== STORIES =====
$("stories-btn").addEventListener("click", async () => {
  $("stories-modal").classList.remove("hidden");
  try {
    const { stories } = await api("/api/stories");
    const list = $("stories-list");
    list.innerHTML = "";
    for (const s of stories) {
      const el = document.createElement("div"); el.className = "story-item";
      const b = document.createElement("b"); b.textContent = s.username;
      const p = document.createElement("p");
      try {
        const key = await YijCrypto.deriveShared(state.myKeys.privateKey, state.myKeys.publicKey);
        p.textContent = await YijCrypto.decrypt(key, s.ciphertext, s.iv);
      } catch { p.textContent = "🔒"; }
      const sm = document.createElement("small");
      sm.textContent = new Date(s.createdAt).toLocaleString(state.locale);
      el.append(b, p, sm);
      list.appendChild(el);
    }
  } catch {}
});
$("story-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("story-input").value.trim();
  if (!text) return;
  try {
    const key = await YijCrypto.deriveShared(state.myKeys.privateKey, state.myKeys.publicKey);
    const { ciphertext, iv } = await YijCrypto.encrypt(key, text);
    await api("/api/stories", { method: "POST", body: JSON.stringify({ ciphertext, iv, type: "text" }) });
    $("story-input").value = "";
    $("stories-btn").click();
  } catch (err) { alert("✗ " + err.message); }
});
$("close-stories").addEventListener("click", () => $("stories-modal").classList.add("hidden"));

// ===== SETTINGS =====
$("settings-btn").addEventListener("click", () => {
  $("theme-select").value = document.documentElement.dataset.theme || "dark";
  $("settings-modal").classList.remove("hidden");
});
$("close-settings").addEventListener("click", () => $("settings-modal").classList.add("hidden"));
$("theme-select").addEventListener("change", (e) => {
  document.documentElement.dataset.theme = e.target.value;
  localStorage.setItem("yijeeb_theme", e.target.value);
});
$("pass-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("pass-msg").textContent = "";
  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: $("old-pass").value, newPassword: $("new-pass").value }),
    });
    $("pass-msg").textContent = "✓ " + t("passChanged");
    $("old-pass").value = ""; $("new-pass").value = "";
  } catch (err) { $("pass-msg").textContent = "✗ " + trError(err.message); }
});
$("push-btn").addEventListener("click", async () => {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("denied");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const { publicKey } = await api("/api/push/vapid-public");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey),
      });
    }
    await api("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
    $("push-btn").textContent = "✓ " + t("pushOnOk");
  } catch { alert(t("pushErr")); }
});

// ===== BACK / LOGOUT =====
$("back").addEventListener("click", () => {
  state.activeConv = null;
  state.activeKey = null;
  state.replyTo = null;
  state.envCache.clear();
  $("chat-area").classList.add("hidden");
  $("list").classList.remove("hidden");
  $("back").classList.add("hidden");
  $("room-avatar").classList.add("hidden");
  $("room-title").textContent = t("appName");
  $("status").textContent = t("connected");
  loadConversations();
});
$("logout").addEventListener("click", leaveApp);

// ===== BOOT =====
(async function boot() {
  if (!state.token) return;
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
    state.myKeys = await idbGet("myKeypair");
    if (state.myKeys) await enterApp();
  } catch { localStorage.removeItem("yijeeb_token"); }
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
