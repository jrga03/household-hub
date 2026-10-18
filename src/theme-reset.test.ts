import { describe, expect, it } from "vitest";
import { compiledThemeForSuite, declarationsIn } from "@/test/tailwind-theme";

const buildClasses = compiledThemeForSuite();

const ruleFor = (className: string) =>
  new RegExp(`(?:^|[\\s}])\\.${className.replace(/[[\]()/.:]/g, "\\\\$&")}\\s*\\{`);

describe("Tailwind's defaults are gone, so only the design system renders", () => {
  it.each([
    "text-green-600",
    "bg-amber-50",
    "bg-white",
    "text-black",
    "bg-black/50",
    "text-sm",
    "text-xs",
    "text-2xl",
    "shadow",
    "shadow-sm",
    "shadow-lg",
    "shadow-inner",
    "inset-shadow-sm",
    "drop-shadow",
    "drop-shadow-md",
    "text-shadow-sm",
    "font-thin",
    "font-light",
    "font-extrabold",
    "font-black",
    "rounded",
    "rounded-xs",
    "rounded-xl",
    "rounded-2xl",
  ])("%s produces no CSS", (className) => {
    expect(buildClasses([className])).not.toMatch(ruleFor(className));
  });

  it.each([
    "bg-background",
    "text-income",
    "border-border",
    "bg-transparent",
    "text-current",
    "text-body",
    "font-medium",
    "shadow-float",
    "shadow-none",
    "rounded-sm",
    "rounded-md",
    "rounded-lg",
    "rounded-t-lg",
    "rounded-full",
    "rounded-none",
  ])("%s still renders", (className) => {
    expect(buildClasses([className])).toMatch(ruleFor(className));
  });

  it.each([
    ["rounded-sm", "calc(var(--radius) - 3px)"],
    ["rounded-md", "6px"],
    ["rounded-lg", "calc(var(--radius) + 4px)"],
  ])("%s keeps its radius step (%s)", (className, radius) => {
    expect(declarationsIn(buildClasses([className]), `\\.${className}`).get("border-radius")).toBe(
      radius
    );
  });
});
