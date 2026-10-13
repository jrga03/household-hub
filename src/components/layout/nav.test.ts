import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./nav";

describe("isNavItemActive", () => {
  it("matches Home only on itself, and other items on their child routes too", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/budget")).toBe(false);
    expect(isNavItemActive("/accounts", "/accounts/abc")).toBe(true);
    expect(isNavItemActive("/accounts", "/accountsx")).toBe(false);
  });

  it("highlights the item a pushed screen declares as its parent", () => {
    expect(isNavItemActive("/budget", "/plan", "/budget")).toBe(true);
    expect(isNavItemActive("/review", "/plan", "/budget")).toBe(false);
  });
});
