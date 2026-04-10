import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// External Supabase project (data & auth)
const EXTERNAL_URL = "https://ovbrrumnqfvtgmqsscat.supabase.co";
const EXTERNAL_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";

// Lovable Cloud (edge functions host)
const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL || "https://dgnqehcezvewkdodqpyh.supabase.co";
const CLOUD_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbnFlaGNlenZld2tkb2RxcHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTY5MDQsImV4cCI6MjA5MDE3MjkwNH0.i3I8kvaAVq4SMJN87YI0eJqO395H7Swdli94zTMiunM";

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

/**
 * Helper to invoke Lovable Cloud edge functions with the external auth token.
 * This ensures the user's JWT from the external Supabase project is forwarded
 * so edge functions can verify identity against the external DB.
 */
export async function invokeCloud(
  functionName: string,
  options?: { body?: unknown; headers?: Record<string, string> },
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.warn(`[invokeCloud] No auth session for ${functionName}`);
  }
  const result = await cloudSupabase.functions.invoke(functionName, {
    ...options,
    headers: {
      ...options?.headers,
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });

  // When edge function returns non-2xx, supabase-js puts FunctionsHttpError in error
  // and data is null. Extract the actual response body from the error context.
  if (result.error && !result.data) {
    try {
      const ctx = (result.error as any).context;
      if (ctx instanceof Response) {
        const body = await ctx.json().catch(() => null);
        if (body) {
          return { data: body, error: null };
        }
      }
    } catch {
      // fallback to original error
    }
  }

  return result;
}
