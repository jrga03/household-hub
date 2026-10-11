import { describe, expect, it } from "vitest";
import { isPermanentRejection } from "./supabase-remote";

describe("which server errors leave an event stuck", () => {
  it.each([
    ["42501", "row-level security refused it"],
    ["23514", "a check constraint refused it"],
    ["23502", "a required column was missing"],
    ["22P02", "a value was malformed"],
    ["P0001", "a database function raised"],
  ])("%s is permanent: %s", (code) => {
    expect(isPermanentRejection(code)).toBe(true);
  });

  it.each([
    ["", "the device couldn't reach the server"],
    ["PGRST301", "the session token expired"],
    ["PGRST000", "the API couldn't reach the database"],
    ["08006", "the database connection dropped"],
    ["42P01", "a table is missing, as during a deploy"],
    ["40001", "a serialization conflict"],
    ["40P01", "a deadlock"],
    ["53300", "too many connections"],
    ["57014", "a statement timeout"],
  ])("%s is transient: %s", (code) => {
    expect(isPermanentRejection(code)).toBe(false);
  });
});
