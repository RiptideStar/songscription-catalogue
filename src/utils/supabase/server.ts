import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Server admin client — service-role key, bypasses RLS.
 * Used by route handlers for all writes (upload, insert, update, delete).
 * This app has no auth, so there are no user sessions to thread through.
 */
export const createAdminClient = () =>
  createSupabaseClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Server read client — publishable key, for read-only server components. */
export const createReadClient = () =>
  createSupabaseClient(supabaseUrl!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
