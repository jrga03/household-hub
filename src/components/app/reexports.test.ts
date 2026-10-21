import { describe, expect, it } from "vitest";

const controls = [
  ["Button", "button"],
  ["Input", "input"],
  ["Textarea", "textarea"],
  ["Select", "select"],
  ["Checkbox", "checkbox"],
  ["Switch", "switch"],
  ["Label", "label"],
  ["Tooltip", "tooltip"],
  ["Popover", "popover"],
  ["Tabs", "tabs"],
  ["Toaster", "sonner"],
  ["FormError", "form-error"],
  ["ActionForm", "action-form"],
  ["SubmitButton", "submit-button"],
  ["CurrencyInput", "currency-input"],
] as const;

describe.each(controls)("@/components/app/%s", (appName, primitiveName) => {
  it(`re-exports ui/${primitiveName} under the same names`, async () => {
    const appModule: Record<string, unknown> = await import(`@/components/app/${appName}.tsx`);
    const primitiveModule: Record<string, unknown> = await import(
      `@/components/ui/${primitiveName}.tsx`
    );
    expect(Object.keys(appModule).sort()).toEqual(Object.keys(primitiveModule).sort());
    for (const name of Object.keys(primitiveModule)) {
      expect(appModule[name]).toBe(primitiveModule[name]);
    }
  });
});
