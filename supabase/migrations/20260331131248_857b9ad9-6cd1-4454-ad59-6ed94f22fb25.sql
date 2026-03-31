ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS recurring_type text DEFAULT null,
ADD COLUMN IF NOT EXISTS recurring_cron text DEFAULT null,
ADD COLUMN IF NOT EXISTS recurring_end_at timestamptz DEFAULT null,
ADD COLUMN IF NOT EXISTS last_recurring_at timestamptz DEFAULT null,
ADD COLUMN IF NOT EXISTS recurring_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS parent_campaign_id uuid REFERENCES public.campaigns(id) DEFAULT null;

COMMENT ON COLUMN public.campaigns.recurring_type IS 'none, daily, weekly, monthly, custom';
COMMENT ON COLUMN public.campaigns.recurring_cron IS 'Cron expression for custom recurring';
COMMENT ON COLUMN public.campaigns.parent_campaign_id IS 'Links recurring instances to their parent campaign';