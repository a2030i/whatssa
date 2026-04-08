---
name: Lovable AI Provider
description: Platform-managed AI provider using Lovable AI Gateway, super admin controlled, with usage tracking
type: feature
---

## Overview
- Lovable AI added as a provider option alongside OpenAI, Gemini, OpenRouter
- Uses the Lovable AI Gateway (https://ai.gateway.lovable.dev/v1) with LOVABLE_API_KEY
- No API key needed from the customer — marked as "MANAGED_BY_PLATFORM"

## Access Control
- Super admin must enable Lovable AI per organization via system_settings key `lovable_ai_enabled_{org_id}`
- Admin dashboard has "✨ AI" tab for managing which orgs have access
- Regular admins can only see Lovable AI as a provider option if super admin enabled it

## Usage Tracking
- All Lovable AI calls are logged to `ai_usage_logs` table (org_id, action, model, tokens_used, triggered_by)
- Super admin can see usage per org in the AI management tab
- Nothing runs automatically — all AI features require manual trigger (suggest reply, summarize, translate, classify)
- auto_reply only activates if the user explicitly enabled it in their AI capabilities settings

## Edge Functions Updated
- `ai-proxy`: Routes lovable_ai calls through gateway, logs usage
- `ai-features`: All actions (suggest_replies, classify, summarize, translate) support lovable_ai with logging
- `ai-auto-reply`: Supports lovable_ai provider for knowledge-base auto replies
