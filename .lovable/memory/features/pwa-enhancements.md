---
name: PWA Enhancements
description: Progressive Web App features including installation, push notifications, and session persistence
type: feature
---

## التثبيت
- صفحة إرشادات (`/install`) تشرح خطوات التثبيت لـ iOS (Safari) و Android (Chrome)

## إشعارات Web Push (VAPID)
- نظام إشعارات حقيقي يعمل حتى عند إغلاق التطبيق/المتصفح بالكامل
- يستخدم Web Push Protocol مع مفاتيح VAPID (P-256 ECDSA)
- المفاتيح تُولّد وتُدار من لوحة السوبر أدمن (إعدادات النظام)
- Edge Functions: `generate-vapid-keys` (توليد) و `send-push-notification` (إرسال)
- جدول `push_subscriptions` يخزن اشتراكات كل مستخدم/جهاز
- Service Worker (`sw.js`) يستقبل الإشعارات ويعرضها حتى في الخلفية

## أنواع الإشعارات
- رسائل جديدة من العملاء
- إسناد محادثات
- المنشن (@)
- خرق الـ SLA
- مواعيد المتابعة المجدولة

## خطوات التفعيل (للسوبر أدمن)
1. الدخول للوحة السوبر أدمن → إعدادات النظام
2. الضغط على "توليد مفاتيح VAPID"
3. المفاتيح تُحفظ تلقائياً في system_settings
4. المستخدمون يفعّلون الإشعارات من صفحة التثبيت

## استمرارية الجلسة
- التطبيق يبقي المستخدم مسجلاً للدخول مع واجهة كاملة الشاشة بدون شريط المتصفح
