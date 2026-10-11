import { createClient } from "@supabase/supabase-js";
import type { AppDatabase } from "@/types/app-database";
import { AUTH_STORAGE_KEY } from "@/lib/auth-storage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient<AppDatabase>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
