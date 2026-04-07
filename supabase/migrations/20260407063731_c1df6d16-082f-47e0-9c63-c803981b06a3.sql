ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sentiment text DEFAULT null;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sentiment_score numeric DEFAULT null;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sentiment_updated_at timestamptz DEFAULT null;

CREATE INDEX IF NOT EXISTS idx_conversations_sentiment ON public.conversations(sentiment) WHERE sentiment IS NOT NULL;