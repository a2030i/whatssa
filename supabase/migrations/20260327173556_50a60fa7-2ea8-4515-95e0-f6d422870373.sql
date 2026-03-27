-- Drop old permissive policies on conversations
DROP POLICY IF EXISTS "Allow anonymous access to conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anonymous insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anonymous update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anonymous delete conversations" ON public.conversations;
DROP POLICY IF EXISTS "allow_all_conversations" ON public.conversations;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.conversations;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.conversations;
DROP POLICY IF EXISTS "Enable update for all users" ON public.conversations;

-- Drop old permissive policies on messages
DROP POLICY IF EXISTS "Allow anonymous access to messages" ON public.messages;
DROP POLICY IF EXISTS "Allow anonymous insert messages" ON public.messages;
DROP POLICY IF EXISTS "Allow anonymous update messages" ON public.messages;
DROP POLICY IF EXISTS "allow_all_messages" ON public.messages;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.messages;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.messages;
DROP POLICY IF EXISTS "Enable update for all users" ON public.messages;

-- Drop old permissive policies on whatsapp_config
DROP POLICY IF EXISTS "Allow anonymous access to whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Allow anonymous insert whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Allow anonymous update whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "allow_all_whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Enable update for all users" ON public.whatsapp_config;

-- Add proper messages policy with org isolation via conversation
CREATE POLICY "Org members see own messages" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c 
      WHERE c.id = conversation_id 
      AND (c.org_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'))
    )
  );

CREATE POLICY "Org members insert messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c 
      WHERE c.id = conversation_id 
      AND c.org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Org members update messages" ON public.messages
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c 
      WHERE c.id = conversation_id 
      AND c.org_id = public.get_user_org_id(auth.uid())
    )
  );