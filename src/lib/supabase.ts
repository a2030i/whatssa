import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ovbrrumnqfvtgmqsscat.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

export const cloudSupabase = supabase;

export async function invokeCloud(
  functionName: string,
  options?: { body?: unknown; headers?: Record<string, string> },
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.warn(`[invokeCloud] No auth session for ${functionName}`);
  }
  const result = await supabase.functions.invoke(functionName, {
    ...options,
    headers: {
      ...options?.headers,
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });

  if (result.error && !result.data) {
    try {
      const ctx = (result.error as any).context;
      if (ctx instanceof Response) {
        const body = await ctx.json().catch(() => null);
        if (body) {
          return { data: body, error: null };
        }
      }
    } catch {}
  }

  return result;
}
