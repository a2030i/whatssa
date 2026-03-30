
-- Add SLA fields to teams
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS sla_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_timeout_minutes integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS escalation_action text DEFAULT 'reassign';

-- Add assigned_at to conversations for SLA tracking
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS escalated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz DEFAULT NULL;
