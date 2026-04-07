---
name: White Label System
description: Multi-partner white-label architecture allowing custom branding per partner
type: feature
---

## Architecture
- `white_label_partners` table: stores branding (name, slug, logo, colors, domain, support info)
- `organizations.partner_id` → links each org to a white-label partner
- `profiles.partner_id` → identifies partner admins
- Respondly is the **default** partner (is_default=true), all existing orgs linked to it

## Roles
- `super_admin` (Platform Owner): manages ALL partners and everything
- `partner_admin`: manages orgs under their partner only
- `admin` / `member`: standard org-level roles

## Helper Functions
- `get_user_partner_id(user_id)`: resolves partner from profile or org
- `is_partner_admin(user_id, partner_id)`: checks partner admin role

## Dynamic Branding
- `WhiteLabelContext` provider wraps the app
- Detects partner by: user's org → custom_domain → default
- Applies CSS variables (--primary) and updates favicon/title dynamically
- AuthPage, Sidebar show partner logo/name instead of hardcoded "Respondly"

## Admin UI
- Tab "وايت ليبل" in Super Admin dashboard
- CRUD for partners with color picker, domain, support info
- Preview dialog shows branded login mockup
- Org count per partner displayed

## RLS
- super_admin: full access to all partners
- partner_admin: read own partner only
- anon: read active partners (for login page branding)
