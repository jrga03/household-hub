import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// The same client, widened to the schema-agnostic type, for code that picks the
// table at runtime (the sync processor writes queue payloads; ensureLocalRow
// fetches by table name). A union of table names cannot select one typed
// overload, and queue payloads are JSON whose shape is fixed where it is built.
export const untypedSupabase: SupabaseClient = supabase;
