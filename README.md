# نماء كارد — VCC Platform

منصة إصدار فيزا افتراضية وان-يوز للعملاء اللي بيدفعوا يوتيوب بيمينتس بالجنيه المصري.

**الفلو:** كاشير HPP (ج.م) → Bitnob Lite Card (USD) → بيانات الكارت للعميل عبر واتساب + صفحة مشفرة.

---

## 🔧 متطلبات

- Node.js ≥ 18
- Vercel CLI: `npm i -g vercel`
- Supabase project
- حساب كاشير (مفاتيح API)
- حساب Bitnob (sandbox أولاً ثم production)

---

## 1. Supabase — إعداد قاعدة البيانات

### أ. رفع الـ Schema

```bash
# في Supabase Dashboard → SQL Editor
# انسخ محتوى supabase/schema.sql والصقه وشغّله
```

### ب. إضافة أدمن

```sql
-- في SQL Editor
INSERT INTO admins (email) VALUES ('your@email.com');
```

### ج. إنشاء مستخدم Auth

في Supabase Dashboard → Authentication → Users → Add user
استخدم نفس الإيميل اللي حطيته في جدول `admins`.

---

## 2. Environment Variables

انسخ `.env.example` لـ `.env.local`:

```bash
cp .env.example .env.local
```

افتح `.env.local` واملأ:

```env
# Supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Kashier (نفس مفاتيح فرصة)
KASHIER_MERCHANT_ID=MID-XXXXX-XXXXX
KASHIER_API_KEY=xxxxxxxxxxxxxxxx
KASHIER_MODE=test          # أو: live
KASHIER_ALLOWED_METHODS=card,wallet

# Bitnob
BITNOB_BASE_URL=https://sandboxapi.bitnob.co   # sandbox
# BITNOB_BASE_URL=https://api.bitnob.co        # production
BITNOB_SECRET_KEY=sk_...

# App
APP_BASE_URL=https://vcc.alnamaa.eg
CARD_ENC_KEY=<شغّل: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# n8n (إشعارات واتساب)
N8N_NOTIFY_WEBHOOK=https://n8n-samir.pixtaha.com/webhook/namaa-vcc-notify

# Cron security
CRON_SECRET=<اختر كلمة سر عشوائية>
```

---

## 3. تشغيل محلي

```bash
npm install
npm run dev          # فرونت على localhost:5173
vercel dev           # فرونت + API functions معًا على localhost:3000
```

---

## 4. Deploy على Vercel

```bash
vercel --prod
```

في Vercel Dashboard → Settings → Environment Variables: أضف كل المتغيرات.

**الكرون:** `vercel.json` عنده كرون كل ساعة على `/api/cron/expire-cards`.
لازم تضيف `CRON_SECRET` في Environment Variables عشان يشتغل.

---

## 5. ويبهوك كاشير

في كاشير Dashboard → Webhooks:
```
URL: https://vcc.alnamaa.eg/api/webhooks/kashier
```

---

## 6. ويبهوك Bitnob

في Bitnob Dashboard → Webhooks:
```
URL: https://vcc.alnamaa.eg/api/webhooks/bitnob
```

---

## 7. إشعارات واتساب (n8n)

الويبهوك بيبعت payload من النوع ده:

```json
{
  "type": "otp",
  "phone": "201001234567",
  "order_code": "NV-XXXXXXXX",
  "otp": "123456"
}
```

```json
{
  "type": "card_ready",
  "phone": "201001234567",
  "order_code": "NV-XXXXXXXX",
  "card_link": "https://vcc.alnamaa.eg/card/NV-XXXXXXXX",
  "last4": "1234",
  "card_usd": 8.65
}
```

اعمل workflow n8n يستقبل الطلب ويبعت رسالة واتساب حسب `type`.

---

## 8. إعداد الباقات

بعد الديبلوي، ادخل `/admin` وأضف باقات من تاب "الباقات":

| الاسم | سعر يوتيوب | قيمة الكارت | السعر النهائي |
|-------|------------|-------------|---------------|
| عضوية شهرية | 130 | 2.50 | 160 |
| عضوية ربع سنة | 360 | 7.00 | 430 |
| عضوية سنة | 1400 | 26.00 | 1650 |

---

## ⚠️ الاختبار الحاسم قبل الإطلاق

**هذا الاختبار إلزامي ولا يُتخطى:**

1. فعّل sandbox mode في Bitnob
2. استخدم كاشير test mode
3. اعمل طلب كامل: دفع → استلم الكارت → **جرّب الكارت فعلياً على عضوية يوتيوب**
4. لو يوتيوب رفض البطاقة (BIN رفض) → تواصل مع Bitnob واطلب BIN مختلف
5. لو نجح → حوّل لـ production

> جوجل بيرفض أحياناً BINs prepaid بعينها. لازم تتأكد الكارت بيشتغل على يوتيوب تحديداً قبل ما تطلق على العملاء.

---

## Supabase — جداول مهمة

| الجدول | الوصف |
|--------|-------|
| `settings` | إعدادات التسعير والنظام |
| `packages` | الباقات الجاهزة |
| `orders` | الطلبات (كاشير → Bitnob) |
| `cards` | بيانات الكروت المشفرة |
| `webhook_logs` | سجل كل ويبهوك |
| `admins` | المدراء المصرح لهم |

---

## 📁 هيكل المشروع

```
namaa-vcc/
├── api/
│   ├── _lib/           ← utilities مشتركة
│   ├── admin/          ← [action].ts catch-all
│   ├── card/           ← request-otp + view
│   ├── cron/           ← expire-cards (ساعي)
│   ├── webhooks/       ← kashier + bitnob
│   ├── create-order.ts
│   ├── order-status.ts
│   └── pricing.ts
├── src/
│   ├── components/     ← VCard
│   ├── lib/            ← supabase + api helpers
│   └── pages/
│       ├── Home.tsx    ← لاندينج + تشيك آوت
│       ├── CardView.tsx← عرض الكارت + OTP
│       └── admin/      ← Login + Admin panel
├── supabase/schema.sql
├── vercel.json
└── .env.example
```

---

## 🔐 الأمان

- بيانات الكارت مشفرة AES-256-GCM في Supabase (مش plain text)
- مفتاح التشفير `CARD_ENC_KEY` موجود بس في Vercel Environment Variables
- RLS مفعّل على Supabase — العميل بيشوف فقط ما يحتاجه عبر الـ serverless functions
- OTP ساري 10 دقايق فقط مع حد 5 محاولات
- الأدمن panel محمي بـ Supabase Auth + جدول admins

---

*مؤسسة النماء — فرص النماء للتنمية المستدامة*
