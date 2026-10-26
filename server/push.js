// إشعارات Web Push عبر VAPID — بلا Firebase وبلا اعتماد على غوغل
// الاشتراكات تُخزَّن في device_tokens (platform = 'web') كسلسلة JSON
const webpush = require("web-push");
const path = require("path");
const fs = require("fs");
const { stmts } = require("./db");

let ready = false;
let VAPID_PUBLIC = null;

function init() {
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  const keyFile = path.join(DATA_DIR, "vapid.json");

  let keys = null;
  if (process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY) {
    keys = { publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY };
  } else if (fs.existsSync(keyFile)) {
    try { keys = JSON.parse(fs.readFileSync(keyFile, "utf8")); } catch { keys = null; }
  } else {
    // توليد مرة واحدة وحفظها — نفس المفاتيح تُستخدم في كل الإقلاعات
    try {
      keys = webpush.generateVAPIDKeys();
      fs.writeFileSync(keyFile, JSON.stringify(keys), "utf8");
      console.log("[push] generated new VAPID keys →", keyFile);
    } catch (e) {
      console.error("[push] key generation failed:", e.message);
      return;
    }
  }

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hello@yijeeb.app",
      keys.publicKey,
      keys.privateKey
    );
    VAPID_PUBLIC = keys.publicKey;
    ready = true;
    console.log("[push] ready (VAPID)");
  } catch (e) {
    console.error("[push] init failed:", e.message);
  }
}

function vapidPublicKey() { return VAPID_PUBLIC; }

function registerSubscription(userId, subscription) {
  const now = Date.now();
  const json = JSON.stringify(subscription);
  stmts.upsertDeviceToken.run(json, userId, "web", now, now);
}
function unregisterSubscription(subscription) {
  try { stmts.deleteDeviceToken.run(JSON.stringify(subscription)); } catch {}
}

async function sendToUser(userId, { title, body, data = {} }) {
  if (!ready) return;
  const rows = stmts.userTokens.all(userId);
  for (const r of rows) {
    let sub;
    try { sub = JSON.parse(r.token); } catch { continue; }
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, data }));
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        try { stmts.deleteDeviceToken.run(r.token); } catch {}
      }
    }
  }
}

module.exports = { init, vapidPublicKey, registerSubscription, unregisterSubscription, sendToUser };
