import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = "https://ovbrrumnqfvtgmqsscat.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
