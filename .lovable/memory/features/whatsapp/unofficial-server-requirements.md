# Memory: features/whatsapp/unofficial-server-requirements
Updated: now

تتطلب ميزات الواتساب غير الرسمي (Evolution API) تهيئة محددة للسيرفر لضمان عمل كافة الميزات:

## الإصدار
- السيرفر الحالي يعمل على **v2.3.7**

## الأحداث المفعلة (Webhook Events)
الأسماء الصحيحة للأحداث في v2.3.7:
- `MESSAGES_UPSERT` — الرسائل الواردة
- `MESSAGES_UPDATE` — حالات التسليم/القراءة (delivered/read)
- `MESSAGES_EDITED` — تعديل الرسائل (ملاحظة: ليس MESSAGES_EDIT)
- `MESSAGES_DELETE` — حذف الرسائل
- `CONNECTION_UPDATE` — حالة الاتصال
- `PRESENCE_UPDATE` — مؤشر الكتابة
- `QRCODE_UPDATED` — تحديث QR
- `SEND_MESSAGE` — الرسائل المرسلة

## ملاحظات مهمة
- **لا يوجد حدث `MESSAGES_REACTION` منفصل** في v2.3.7 — التفاعلات تأتي ضمن أحداث أخرى
- **لا يوجد حدث `MESSAGES_EDIT`** — الاسم الصحيح هو `MESSAGES_EDITED`
- **لا يوجد `STATUS_INSTANCE`** — يُستخدم `CONNECTION_UPDATE` بدلاً منه
- عند إنشاء instances جديدة، يجب استخدام هذه الأسماء الصحيحة

## صيغة تسجيل الـ Webhook (v2.3.7)
- المسار: `POST /webhook/set/{instanceName}`
- الصيغة الصحيحة: جسم مسطح (flat body) بدون تغليف `webhook: {}`
```json
{
  "url": "...",
  "enabled": true,
  "webhookByEvents": false,
  "webhookBase64": false,
  "events": [...]
}
```
- ملاحظة: الصيغة المغلفة `{ webhook: { ... } }` تُستخدم فقط في `instance/create`
- عند `webhookByEvents: true`، يُلحق Evolution مسارات فرعية مثل `/messages-update` بعنوان الـ Webhook

## تعليم الرسائل كمقروءة
- المسار: `POST /chat/markMessageAsRead/{instanceName}` (POST وليس PUT)
- جسم الطلب: `{ readMessages: [{ remoteJid, fromMe, id }] }`

## Instance الحالي
- اسم الـ instance: `org_0baa3015983c` (أحدث) و `org_1c3b7fdd1c27`
