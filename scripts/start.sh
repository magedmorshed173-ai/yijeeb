#!/bin/sh
# ============================================================
# يجيب — مُشغّل الخادم العام (لينكس · macOS · Termux/أندرويد)
# يعيد استخدام نفس سر الجلسة في كل تشغيل حتى لا يُسجَّل المستخدمون خروجًا
# الاستخدام:  bash scripts/start.sh
# ============================================================
set -e

# جذر المستودع = مجلد سكربتات + ..
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR/server" || { echo "خطأ: لم أجد مجلد server — شغّل السكربت من داخل نسخة يجيب"; exit 1; }

# مجلد البيانات (قاعدة البيانات + المرفقات + مفاتيح الإشعارات)
DATA_DIR="${DATA_DIR:-$DIR/data}"
export DATA_DIR
mkdir -p "$DATA_DIR"

# JWT_SECRET: يُولَّد مرة واحدة ويُحفظ في مجلد البيانات
SECRET_FILE="$DATA_DIR/.jwt_secret"
if [ -z "$JWT_SECRET" ]; then
  if [ -f "$SECRET_FILE" ]; then
    JWT_SECRET="$(tr -d ' \n\r' < "$SECRET_FILE")"
  else
    JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || true)"
    [ -n "$JWT_SECRET" ] || JWT_SECRET="$(node -p "require('crypto').randomBytes(32).toString('hex')")"
    printf '%s' "$JWT_SECRET" > "$SECRET_FILE"
    echo "› وُلِّد سر جلسة جديد وحُفظ في: $SECRET_FILE"
  fi
  export JWT_SECRET
fi

# عنوان الجهاز على الشبكة المحلية (أفضل تقدير — اختياري)
LAN_IP="$(ip -4 addr show scope global 2>/dev/null | grep -m1 -oE 'inet [0-9.]+' | awk '{print $2}' || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"

PORT="${PORT:-3000}"
echo ""
echo "  ================================"
echo "   يجيب يشتغل الآن"
echo "  ================================"
echo "   على هذا الجهاز : http://localhost:$PORT"
[ -n "$LAN_IP" ] && echo "   على شبكتك      : http://$LAN_IP:$PORT"
echo "   للإيقاف        : Ctrl+C"
echo "   لإعادة التشغيل : bash scripts/start.sh"
echo "  ================================"
echo ""

# فتح المتصفح تلقائيًا بعد 3 ثوانٍ (إن وُجد أمر الفتح)
( sleep 3; { command -v termux-open >/dev/null 2>&1 && termux-open "http://localhost:$PORT"; } || \
            { command -v xdg-open   >/dev/null 2>&1 && xdg-open   "http://localhost:$PORT" >/dev/null 2>&1; } || \
            { command -v open       >/dev/null 2>&1 && open       "http://localhost:$PORT"; } || true ) &

exec node server.js
