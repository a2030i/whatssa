import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// External Supabase project (data & auth)
const EXTERNAL_URL = "https://ovbrrumnqfvtgmqsscat.supabase.co";
const EXTERNAL_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";

// Lovable Cloud (edge functions host)
const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL;
const CLOUD_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Main client — all DB queries, auth, realtime go to external project
export const supabase = createClient<Database>(EXTERNAL_URL, EXTERNAL_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Cloud client — only for cloudSupabase.functions.invoke() calls
export const cloudSupabase = createClient(CLOUD_URL, CLOUD_KEY);
