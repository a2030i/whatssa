
-- Update trial default to 7 days
ALTER TABLE public.organizations 
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days');

-- Free plan
UPDATE public.plans SET
  name = 'Free', name_ar = 'المجانية', description = 'ابدأ مجاناً واستكشف المنصة',
  max_conversations = 50, max_messages_per_month = 500, max_team_members = 1,
  max_phone_numbers = 1, max_unofficial_phones = 0, max_stores = 0,
  max_teams = 1, max_campaigns_per_month = 1, max_api_tokens = 1, trial_days = 7, sort_order = 0
WHERE id = 'f4d1d35c-43b2-4ffc-be12-0b24d44eb34f';

-- Basic plan
UPDATE public.plans SET
  name = 'Basic', name_ar = 'الأساسية', description = 'للمشاريع الصغيرة والفرق الناشئة',
  max_conversations = 500, max_messages_per_month = 5000, max_team_members = 3,
  max_phone_numbers = 2, max_unofficial_phones = 1, max_stores = 1,
  max_teams = 2, max_campaigns_per_month = 5, max_api_tokens = 2, trial_days = 7, sort_order = 1
WHERE id = '4016d81b-ef5f-4012-829c-5834db70480c';

-- Professional plan
UPDATE public.plans SET
  name = 'Professional', name_ar = 'الاحترافية', description = 'للشركات المتوسطة والمتنامية',
  max_conversations = 2000, max_messages_per_month = 20000, max_team_members = 10,
  max_phone_numbers = 5, max_unofficial_phones = 3, max_stores = 3,
  max_teams = 5, max_campaigns_per_month = 20, max_api_tokens = 5, trial_days = 7, sort_order = 2
WHERE id = 'b7d7a054-c105-4582-8958-2d30ee60765f';

-- Enterprise plan
UPDATE public.plans SET
  name = 'Enterprise', name_ar = 'الشركات', description = 'للمؤسسات الكبيرة والاحتياجات المتقدمة',
  max_conversations = 999999, max_messages_per_month = 999999, max_team_members = 50,
  max_phone_numbers = 20, max_unofficial_phones = 10, max_stores = 10,
  max_teams = 20, max_campaigns_per_month = 999999, max_api_tokens = 20, trial_days = 7, sort_order = 3
WHERE id = 'ea5307e3-91fb-4f40-a7ac-65082e366425';
