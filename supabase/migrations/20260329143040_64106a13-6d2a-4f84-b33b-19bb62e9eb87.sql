
-- Remove overly permissive policies that cause data leakage

-- whatsapp_config: remove "Authenticated users can view config" (USING true)
DROP POLICY IF EXISTS "Authenticated users can view config" ON public.whatsapp_config;

-- conversations: remove "Authenticated users can view conversations" (USING true)
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.conversations;

-- messages: remove "Authenticated users can view messages" (USING true)
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.messages;
