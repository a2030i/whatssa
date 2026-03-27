---
name: SaaS Architecture
description: Multi-tenant architecture with organizations, plans, subscriptions, user roles, and RLS isolation
type: feature
---

## Tables
- `organizations`: tenant entity, linked to plan, has subscription_status (trial/active/expired/cancelled)
- `profiles`: user profile linked to auth.users(id) + org_id
- `user_roles`: separate roles table with app_role enum (super_admin, admin, member)
- `plans`: 4 tiers (مجاني, أساسي, احترافي, مؤسسي) with limits
- `conversations`, `whatsapp_config`: have org_id for tenant isolation

## Key Functions
- `has_role(user_id, role)`: SECURITY DEFINER role check
- `get_user_org_id(user_id)`: SECURITY DEFINER org lookup
- `handle_new_user()`: trigger on auth.users INSERT — creates org + profile + admin role

## Routes
- `/auth` — login/signup (public)
- `/admin` — super admin dashboard (super_admin only)
- All other routes require authentication

## Auto-confirm email is ON for easier testing