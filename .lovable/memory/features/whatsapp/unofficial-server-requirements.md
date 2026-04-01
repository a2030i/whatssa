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

## Instance الحالي
- اسم الـ instance: `org_1c3b7fdd1c27`
