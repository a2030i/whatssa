-- Add org_id to messages so Realtime can be safely filtered per tenant.
-- This avoids relying on RLS policies that JOIN conversations (which may not
-- be applied consistently for Realtime event delivery).

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS org_id uuid;

-- Backfill existing rows from conversations
UPDATE public.messages m
SET org_id = c.org_id
FROM public.conversations c
WHERE c.id = m.conversation_id
  AND m.org_id IS NULL;

-- Keep org_id in sync for new messages
CREATE OR REPLACE FUNCTION public.set_message_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT c.org_id INTO NEW.org_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_message_org_id_trigger ON public.messages;
CREATE TRIGGER set_message_org_id_trigger
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_org_id();

-- Enforce tenant link integrity
ALTER TABLE public.messages
  ADD CONSTRAINT messages_org_id_fkey
  FOREIGN KEY (org_id)
  REFERENCES public.organizations(id)
  ON DELETE CASCADE;

-- Make org_id required going forward (after backfill)
ALTER TABLE public.messages
  ALTER COLUMN org_id SET NOT NULL;

-- Helpful index for tenant-scoped reads
CREATE INDEX IF NOT EXISTS messages_org_id_created_at_idx
  ON public.messages(org_id, created_at DESC);

-- Replace message policies to use org_id directly (safer for Realtime filters)
DROP POLICY IF EXISTS "Org members see own messages" ON public.messages;
DROP POLICY IF EXISTS "Org members insert messages" ON public.messages;
DROP POLICY IF EXISTS "Org members update messages" ON public.messages;

CREATE POLICY "Org members see own messages" ON public.messages
  FOR SELECT TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Org members insert messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.org_id = org_id
    )
  );

CREATE POLICY "Org members update messages" ON public.messages
  FOR UPDATE TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid())
  );

