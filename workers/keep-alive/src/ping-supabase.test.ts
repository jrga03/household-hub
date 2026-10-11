import { afterEach, describe, expect, it, vi } from "vitest";
import { pingSupabase } from "./ping-supabase";

const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon-key" };

describe("pingSupabase", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls keep_alive with the anon key and logs success", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("true", { status: 200 }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await pingSupabase(env, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith("https://project.supabase.co/rest/v1/rpc/keep_alive", {
      method: "POST",
      headers: { apikey: "anon-key", Authorization: "Bearer anon-key" },
    });
    expect(log).toHaveBeenCalledWith("Supabase keep-alive succeeded");
  });

  it("logs an error and rejects when Supabase answers with a failure", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"message":"paused"}', { status: 503 }));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(pingSupabase(env, fetchFn)).rejects.toThrow("Supabase keep-alive failed: 503");
    expect(error).toHaveBeenCalledWith('Supabase keep-alive failed: 503 {"message":"paused"}');
  });

  it("logs an error and rejects when Supabase cannot be reached", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(pingSupabase(env, fetchFn)).rejects.toThrow("fetch failed");
    expect(error).toHaveBeenCalledWith("Supabase keep-alive failed: TypeError: fetch failed");
  });
});
