import { describe, expect, it } from "vitest";
import { compiledThemeForSuite, declarationsIn } from "@/test/tailwind-theme";

const buildClasses = compiledThemeForSuite();

function declarationsOf(className: string) {
  return declarationsIn(buildClasses([className]), `\\.${className}`);
}

describe("type roles", () => {
  it.each([
    ["text-display", "30px", "36px", "650"],
    ["text-title", "22px", "28px", "600"],
    ["text-heading", "17px", "24px", "600"],
    ["text-body", "15px", "22px", "400"],
    ["text-label", "13px", "18px", "550"],
    ["text-caption", "12px", "16px", "400"],
    ["text-figure", "34px", "40px", "600"],
  ])(
    "%s sets size %s, line-height %s and weight %s in one class",
    (role, size, lineHeight, weight) => {
      const declarations = declarationsOf(role);
      expect(declarations.get("font-size")).toBe(size);
      expect(declarations.get("line-height")).toBe(lineHeight);
      expect(declarations.get("font-weight")).toBe(weight);
    }
  );

  it("text-control is 16px on 24px so phones don't zoom into form fields", () => {
    const declarations = declarationsOf("text-control");
    expect(declarations.get("font-size")).toBe("16px");
    expect(declarations.get("line-height")).toBe("24px");
  });

  it.each([
    ["font-normal", "400"],
    ["font-medium", "550"],
    ["font-semibold", "600"],
    ["font-bold", "650"],
  ])("%s renders at weight %s", (className, weight) => {
    expect(declarationsOf(className).get("font-weight")).toBe(weight);
  });

  it("running text defaults to the body role", () => {
    const declarations = declarationsIn(buildClasses([]), "body");
    expect(declarations.get("font-size")).toBe("15px");
    expect(declarations.get("line-height")).toBe("22px");
  });

  it("font-sans is Source Sans 3 with the system stack as fallback", () => {
    expect(declarationsOf("font-sans").get("font-family")).toBe(
      '"Source Sans 3", system-ui, sans-serif'
    );
  });
});
