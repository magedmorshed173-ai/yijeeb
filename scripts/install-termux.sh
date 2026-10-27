#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# يجيب — تثبيت وتشغيل على أندرويد عبر Termux بسطر واحد:
#   pkg install -y curl && curl -fsSL \
#   https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-termux.sh | bash
# ============================================================
set -e

REPO_URL="https://github.com/magedmorshed173-ai/yijeeb.git"
APP_DIR="$HOME/yijeeb"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   يجيب — تثبيت على أندرويد       ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# 1) الاعتماديات
echo "› [1/4] تثبيت Node.js و Git…"
pkg install -y nodejs-lts git >/dev/null 2>&1 || pkg install -y nodejs-lts git
if ! command -v node >/dev/null 2>&1; then
  echo "✗ تعذّر تثبيت Node.js — شغّل يدويًا: pkg install nodejs-lts" && exit 1
fi
echo "  Node $(node --version) ✓"

# 2) تنزيل أو تحديث يجيب
echo "› [2/4] تنزيل يجيب…"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only 2>/dev/null && echo "  محدَّث لأحدث نسخة ✓" || echo "  (بقيت النسخة الحالية)"
else
  [ -d "$APP_DIR" ] && rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
  echo "  نُزِّلت إلى $APP_DIR ✓"
fi

# 3) الاعتماديات
echo "› [3/4] تجهيز الخادم…"
cd "$APP_DIR/server"
npm install --no-audit --no-fund --loglevel=error
echo "  جاهز ✓"

# 4) منع أندرويد من قتل الخادم والانطلاق
echo "› [4/4] تشغيل يجيب…"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

cd "$APP_DIR"
exec bash scripts/start.sh
