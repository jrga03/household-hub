import { describe, expect, it } from "vitest";
import {
  deleteStaleSignUps,
  ensureTestUsers,
  isLocalSupabaseUrl,
  isStaleSignUp,
} from "../e2e/fixtures/ensure-test-users";

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

describe("isStaleSignUp", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const twoHoursAgo = "2026-11-01T10:00:00Z";

  it("accepts a sign-up from an earlier run", () => {
    expect(
      isStaleSignUp(
        { email: "test-1761990000000-ab12cd@example.com", created_at: twoHoursAgo },
        now
      )
    ).toBe(true);
  });

  it("keeps a sign-up a parallel run may still use", () => {
    expect(
      isStaleSignUp(
        { email: "test-1761990000000-ab12cd@example.com", created_at: "2026-11-01T11:30:00Z" },
        now
      )
    ).toBe(false);
  });

  it.each(["test@example.com", "test2@example.com", "test-no-household@example.com", undefined])(
    "keeps the fixture user %s",
    (email) => {
      expect(isStaleSignUp({ email, created_at: twoHoursAgo }, now)).toBe(false);
    }
  );
});

describe("deleteStaleSignUps", () => {
  it("refuses a remote Supabase before contacting it", async () => {
    await expect(deleteStaleSignUps("https://abcdefgh.supabase.co", "service-key")).rejects.toThrow(
      /abcdefgh\.supabase\.co/
    );
  });
});
