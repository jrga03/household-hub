import { pingSupabase, type KeepAliveEnv } from "./ping-supabase";

export default {
  async scheduled(_controller: unknown, env: KeepAliveEnv) {
    await pingSupabase(env);
  },
};
