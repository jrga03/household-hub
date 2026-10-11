export interface KeepAliveEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const FAILURE_MESSAGE = "Supabase keep-alive failed";

export async function pingSupabase(env: KeepAliveEnv, fetchFn: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/keep_alive`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    });
  } catch (error) {
    console.error(`${FAILURE_MESSAGE}: ${String(error)}`);
    throw error;
  }
  if (!response.ok) {
    console.error(`${FAILURE_MESSAGE}: ${response.status} ${await response.text()}`);
    throw new Error(`${FAILURE_MESSAGE}: ${response.status}`);
  }
  console.log("Supabase keep-alive succeeded");
}
