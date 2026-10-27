<div align="center">

<img src="brand/app-icon.png" width="110" alt="Yijeeb App Icon"/>

# YIJEEB · يجيب

**يردّ. يجيب. يوصّل.** — *Answers · Brings · Delivers*

تطبيق دردشة عربي خفيف وسريع: شات نصي وصوتي، رسائل صوتية، ومكالمات فيديو — بلا بطء وبلا إعلانات.

[![Landing](https://img.shields.io/badge/Landing-yijeeb.vercel.app-0D9488?style=for-the-badge&logo=vercel)](https://yijeeb.vercel.app)
[![Tests](https://img.shields.io/badge/Tests-41%2F41%20%E2%9C%93-5EEAD4?style=for-the-badge&labelColor=0F766E)](#-الاختبارات)
[![License](https://img.shields.io/badge/License-Proprietary-042F2E?style=for-the-badge)](LICENSE)
[![Status](https://img.shields.io/badge/Phase-Chat_%2B_Calls-5EEAD4?style=for-the-badge&labelColor=0F766E)](#-خطة-التطوير)

</div>

---

## لماذا يجيب؟

| المعنى | الشرح |
|--------|-------|
| **يردّ** | ردّ فوري على كل رسالة — بلا تأخير ولا تعليق |
| **يجيب** | يجيب لك كل وسائل التواصل في تطبيق واحد |
| **يوصّل** | صوتك وصورتك توصل بجودة واضحة |

تطبيق دردشة **مبني للمستخدم العربي أولاً** — تصميم RTL أصيل، تشفير من طرف إلى طرف، حجم صغير، وتجربة نظيفة بلا إعلانات.

## الميزات (Chat MVP v1)

| | الميزة | التفاصيل |
|--|--------|----------|
| 🔐 | **تشفير طرف-لطرف** | ECDH P-256 + HKDF + AES-256-GCM — الخادم لا يرى المحتوى أبدًا |
| 💬 | **محادثات خاصة** | مفاتيح مشتقة لحظيًا بين الطرفين |
| 👥 | **مجموعات وقنوات** | مفتاح مجموعة مُغلَّف لكل عضو |
| 🔄 | **تدوير المفاتيح** | عند إزالة عضو أو يدويًا — مع فرض الإصدارات على الخادم |
| 🎤 | **رسائل صوتية** | تسجيل بضغطة، تشفير، مشغل بموجات — Opus/WebM |
| 📞 | **مكالمات صوت وفيديو** | WebRTC طرف-لططف (مشفرة DTLS-SRTP) — رنين، قبول/رفض، كتم، مؤقت مدة |
| 📎 | **مرفقات مشفرة** | صور/فيديو/ملفات حتى 30MB مع شريط تقدم |
| ✏️ | **تعديل وحذف** | للجميع + نسخ النص |
| ↩️ | **الرد على رسالة** | اقتباس مع قفزة للرسالة الأصلية |
| 🔢 | **عدّاد غير المقروء** | لكل محادثة + آخر نشاط |
| 🟢 | **حالة الاتصال** | متصل/غير متصل في رأس المحادثة |
| ⌨️ | **مؤشر الكتابة** | وإيصالات قراءة ✓✓ |
| 🔍 | **بحث محلي** | في الرسائل المفكوكة على جهازك فقط |
| ☀️ | **وضع فاتح/داكن** | بهوية يجيب الفيروزية |
| 🔔 | **إشعارات Web Push** | عبر VAPID مباشرة — بلا وسيط خارجي |
| 🔑 | **نسخة احتياطية للمفاتيح** | رمز استعادة PBKDF2 (600k تكرار) |
| ◉ | **ستوريز** | 24 ساعة، مشفرة |
| 🌍 | **i18n** | عربي / English / Français |
| 📱 | **PWA** | قابل للتثبيت + عمل دون اتصال |
| 🖥️ | **كل المنصات** | أندرويد (Termux) · iOS · ويندوز · لينكس · ماك · Docker — بسطر واحد |
| 🛡️ | **حماية الخادم** | Helmet + CSP + Rate limits + JWT |

## البنية

```
yijeeb/
├── index.html          ← صفحة الهبوط (Vercel)
├── app/                ← عميل الشات PWA (يخدمه خادم الشات)
│   ├── index.html · style.css · app.js
│   ├── crypto.js       ← E2EE كامل بالمتصفح
│   ├── i18n.js · manifest.json · sw.js
│   └── icons/          ← 192/512
├── server/             ← خادم الشات (Node 22.13+)
│   ├── server.js       ← Express + Socket.IO
│   ├── db.js           ← node:sqlite (مدمج، بلا اعتماديات DB)
│   ├── auth.js         ← bcrypt + JWT
│   ├── security.js     ← Helmet + Rate limits
│   └── push.js         ← Web Push VAPID
├── render.yaml         ← نشر Render بضغطة
├── Dockerfile          ← صورة Docker لكل المنصات + docker-compose.yml
├── scripts/            ← مثبّتات كل المنصات (Termux/لينكس/ماك/ويندوز) + المُشغّلات
└── brand/              ← أصول الهوية البصرية
```

## يعمل على كل المنصات

| المنصة | الطريقة | الأمر |
|--------|---------|-------|
| 🤖 **أندرويد** | Termux — خادم كامل على هاتفك | `pkg install -y curl && curl -fsSL https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-termux.sh \| bash` |
| 🍎 **آيفون / آيباد** | سفاري ← مشاركة ← «إضافة إلى الشاشة الرئيسية» | — |
| 🪟 **ويندوز 10/11** | PowerShell | `irm https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-windows.ps1 \| iex` |
| 🐧 **لينكس** | Bash | `curl -fsSL https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-linux.sh \| bash` |
| 🍏 **macOS** | Bash + Homebrew | `curl -fsSL https://raw.githubusercontent.com/magedmorshed173-ai/yijeeb/main/scripts/install-mac.sh \| bash` |
| 🐳 **Docker** | أي نظام تشغيل | `git clone https://github.com/magedmorshed173-ai/yijeeb.git && cd yijeeb && docker compose up -d` |

كل سكربت تثبيت: يتحقق من Node.js 22+ ويثبّته إن غاب ← ينزّل يجيب (أو يحدّثه) ← يجهّز الخادم ← يولّد `JWT_SECRET` ويحفظه تلقائيًا ← يشغّل ويفتح المتصفح.

**لإعادة التشغيل لاحقًا:**

- لينكس / ماك / Termux: `bash ~/yijeeb/scripts/start.sh`
- ويندوز: انقر مرتين على `C:\Users\اسمك\yijeeb\scripts\start-yijeeb.bat`
- Docker: `docker compose up -d`

بعد الإقلاع افتح `http://localhost:3000` — ومن أي جهاز آخر على نفس الشبكة: `http://IP-الجهاز:3000`.

## التشغيل اليدوي (للمطورين)

```bash
# يتطلب Node.js 22.13+ (لأن node:sqlite مدمج)
git clone https://github.com/magedmorshed173-ai/yijeeb.git && cd yijeeb
cd server
npm install
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") npm start
# افتح http://localhost:3000
```

سجّل حسابين (من متصفحين أو نافذتين متخفيتين) وجرّب: محادثة خاصة، مجموعة، رسالة صوتية، مرفق، ومكالمة صوت/فيديو. لكل الإعدادات انظر `.env.example`.

## النشر على Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/magedmorshed173-ai/yijeeb)

بضغطة واحدة: الزر يقرأ `render.yaml` تلقائيًا ويُنشئ الخدمة كاملة (JWT_SECRET يُولَّد تلقائيًا، مفاتيح VAPID أول إقلاع).

أو يدويًا: في Render: **New → Blueprint** واختر `yijeeb`

**مهم**: الخطة المجانية تفقد البيانات عند كل نشر. للإنتاج رقِّ إلى Starter وأضف قرصًا:
   ```yaml
   plan: starter
   disk:
     name: yijeeb-data
     mountPath: /var/data
     sizeGB: 1
   envVars:
     - key: DATA_DIR
       value: /var/data
   ```
4. (اختياري) اربط دومينك المخصص من إعدادات الخدمة

## الاختبارات

41/41 ✓ — تشمل: تسجيل/دخول، تدفق DM كامل، **E2EE roundtrip بمفاتيح حقيقية (تشفير عميل → خادم → فك عميل)**، مرفقات (رفع/تنزيل/تحقق تطابق)، مجموعات + تدوير مفاتيح + رفض الإصدارات القديمة، قراءات، حالة اتصال، VAPID، ستوريز، رفض الوصول بلا توكن، وإشارات المكالمات كاملة: تمرير العرض/الإجابة، مرشحو ICE باتجاهين، منع غير المشتركين، حالة مشغول، الرفض يحرر الحالة، القطع أثناء المكالمة، والإلغاء قبل الرد.

## نقاط حرجة

- **لا تفقد رمز الاستعادة** — بدونه، تغيير الجهاز = فقدان الرسائل
- **الخادم لا يرى المحتوى** — كل الرسائل نصوص مشفرة عنده
- **حذف العضو = تدوير المفتاح** — المُزال لا يقرأ ما بعده

## خطة التطوير

| المرحلة | المحتوى | الحالة |
|---------|---------|--------|
| **0** | الهوية البصرية + اسم + شعار + دليل كامل | ✅ |
| **1** | صفحة هبوط + قائمة انتظار | ✅ منشورة |
| **2** | **Chat MVP**: شات E2EE + مجموعات + مرفقات + صوتيات | ✅ |
| **3** | مكالمات صوت وفيديو (WebRTC) | ✅ هذا الإصدار |
| **+** | تشغيل على كل المنصات: Termux / ويندوز / لينكس / ماك / Docker + صفحة تحميل | ✅ |
| **4** | تطبيقات iOS / Android (React Native) + متاجر | ⏳ التالية |
| **5** | تشفير متقدم (Double Ratchet) + رسائل مختفية | ⏳ |

## التقنيات

- **الخادم**: Node.js 22.13+ · Express · Socket.IO · `node:sqlite` · web-push
- **العميل**: Vanilla JS (بلا build) · Web Crypto API · WebRTC · Cairo RTL
- **الاستضافة**: Vercel (الهبوط) + Render (الشات والمكالمات) — أو استضفها بنفسك: Docker / Termux / أي جهاز

---

<div align="center">

**يجيب… دايمًا يجيبها**

للتواصل: chatyijeeb@gmail.com

© 2026 Yijeeb — صُنع بشغف للعربية

</div>
