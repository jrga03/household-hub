import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn with type roles", () => {
  it("keeps a text color next to a type role", () => {
    expect(cn("text-muted-foreground", "text-body")).toBe("text-muted-foreground text-body");
  });

  it("lets a later type role replace an earlier one", () => {
    expect(cn("text-label text-muted-foreground", "text-caption")).toBe(
      "text-muted-foreground text-caption"
    );
  });

  it("lets a later text color replace an earlier one without dropping the role", () => {
    expect(cn("text-heading text-foreground", "text-destructive")).toBe(
      "text-heading text-destructive"
    );
  });
});
