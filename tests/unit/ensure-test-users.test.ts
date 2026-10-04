import { describe, expect, it } from "vitest";
import { ensureTestUsers, isLocalSupabaseUrl } from "../e2e/fixtures/ensure-test-users";

describe("isLocalSupabaseUrl", () => {
  it.each(["http://127.0.0.1:54331", "http://localhost:54321", "http://localhost"])(
    "accepts %s",
    (url) => {
      expect(isLocalSupabaseUrl(url)).toBe(true);
    }
  );

  it.each([
    "https://abcdefgh.supabase.co",
    "http://127.0.0.1.example.com",
    "http://localhost.example.com",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false);
  });
});

describe("ensureTestUsers", () => {
  it("refuses a remote Supabase before contacting it", async () => {
    await expect(ensureTestUsers("https://abcdefgh.supabase.co", "service-key")).rejects.toThrow(
      /abcdefgh\.supabase\.co.*only created on a local Supabase/
    );
  });
});
