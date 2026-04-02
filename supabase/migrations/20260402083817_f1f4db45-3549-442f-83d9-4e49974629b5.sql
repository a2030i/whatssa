INSERT INTO public.user_roles (user_id, role)
VALUES ('e3e22d45-d476-464c-9f2d-9c9c3c061261', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;