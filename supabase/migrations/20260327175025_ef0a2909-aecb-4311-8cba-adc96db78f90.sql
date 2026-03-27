INSERT INTO public.user_roles (user_id, role)
VALUES ('99ad19d8-26e4-4f08-b611-02ef67b36fe2', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;