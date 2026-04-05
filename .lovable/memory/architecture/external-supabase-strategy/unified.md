# Memory: architecture/external-supabase-strategy/unified
Updated: now

استراتيجية الاتصال بقاعدة البيانات:
1. **الأولوية**: جميع Edge Functions تستخدم `SUPABASE_URL` (Lovable Cloud) كأولوية أولى مع fallback إلى `EXTERNAL_SUPABASE_URL`.
2. **السبب**: البيانات الفعلية (whatsapp_config, conversations, messages, profiles) موجودة في قاعدة Lovable Cloud. القاعدة الخارجية (ovbrrumnqfvtgmqsscat) لم تعد تحتوي على البيانات المحدثة.
3. **الإصلاح الجذري (2026-04-05)**: تم عكس أولوية ENV vars في جميع الـ 38 Edge Function من `EXTERNAL_ || LOCAL` إلى `LOCAL || EXTERNAL_` لضمان الاتصال بالقاعدة الصحيحة.
4. **التخزين (Storage)**: باكت `chat-media` في Lovable Cloud.
5. **العميل المزدوج في الواجهة**: `@/lib/supabase` للمشروع الخارجي (Auth) و `cloudSupabase` لوظائف Lovable Cloud.
