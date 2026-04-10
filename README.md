# WhatsSA — منصة إدارة محادثات العملاء

منصة SaaS متكاملة لإدارة محادثات العملاء عبر واتساب والبريد الإلكتروني، مصممة للشركات في السوق السعودي.

## ✨ المميزات الرئيسية

- **صندوق وارد موحّد** — واتساب (Meta API + Baileys) والبريد الإلكتروني (SMTP/IMAP) في مكان واحد
- **ذكاء اصطناعي** — رد تلقائي ذكي، تحليل المشاعر، وقاعدة معرفة قابلة للتخصيص
- **حملات جماعية** — نظام طابور متقدم مع تقسيم دفعات وتتبع لحظي
- **بوت محادثة** — تدفقات مرئية قابلة للتخصيص مع جدولة وشروط
- **إدارة العملاء (CRM)** — ملفات عملاء، تصنيفات، دورة حياة، ودمج المكررات
- **تكامل المتاجر** — ربط مع سلة (Salla) والشحن عبر لمحة (Lamha)
- **فريق العمل** — أدوار وصلاحيات، توزيع تلقائي، حضور وانصراف
- **تقارير وتحليلات** — أداء الوكلاء، ROI الحملات، خريطة النشاط
- **نظام تذاكر** — إدارة مهام ومتابعات داخلية
- **API عام** — توكنات مع صلاحيات دقيقة وتوثيق تفاعلي
- **PWA** — دعم الإشعارات والتثبيت على الأجهزة

## 🛠 التقنيات

| الطبقة | التقنية |
|---|---|
| Frontend | React 18, TypeScript 5, Vite 5 |
| التصميم | Tailwind CSS 3, shadcn/ui, Radix UI |
| Backend | Supabase (Lovable Cloud) |
| قاعدة البيانات | PostgreSQL + RLS |
| الدوال | Supabase Edge Functions (Deno) |
| الحالة | TanStack React Query |
| الدفع | Moyasar |
| الذكاء الاصطناعي | Lovable AI Gateway (Gemini, GPT) |

## 🚀 التشغيل المحلي

```bash
# 1. استنساخ المشروع
git clone <repo-url>
cd <project-dir>

# 2. تثبيت الاعتماديات
npm install

# 3. تشغيل خادم التطوير
npm run dev
```

> المتغيرات البيئية (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) تُدار تلقائياً عبر Lovable Cloud.

## 📁 هيكل المشروع

```
src/
├── components/       # مكونات UI (inbox, dashboard, settings, ...)
├── contexts/         # AuthContext
├── hooks/            # Custom hooks
├── integrations/     # Supabase client + types
├── pages/            # صفحات التطبيق
├── lib/              # أدوات مساعدة
└── data/             # بيانات تجريبية
supabase/
├── functions/        # Edge Functions (~80 وظيفة)
├── migrations/       # تعديلات قاعدة البيانات
└── config.toml       # إعدادات المشروع
```

## 🔒 الأمان

- Row Level Security (RLS) على جميع الجداول
- أدوار مستخدمين منفصلة (`user_roles`)
- تشفير MIME كامل للبريد الإلكتروني
- توكنات API مع تجزئة (hashing)

## 📄 الرخصة

مشروع خاص — جميع الحقوق محفوظة.
