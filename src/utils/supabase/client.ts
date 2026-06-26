import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Browser client — publishable key, read-only by RLS. */
export const createClient = () =>
  createBrowserClient(supabaseUrl!, supabaseKey!);
