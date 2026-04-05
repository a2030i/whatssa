CREATE OR REPLACE FUNCTION public.update_last_message_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE conversations 
  SET last_message_sender = NEW.sender
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_last_message_sender
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_last_message_sender();