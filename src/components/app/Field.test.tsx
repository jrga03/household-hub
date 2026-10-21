import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./Field";
import { Input } from "./Input";
import { CurrencyInput } from "./CurrencyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";

describe("Field", () => {
  it("names its control with the visible label", () => {
    render(
      <Field label="Account name">
        <Input />
      </Field>
    );
    expect(screen.getByRole("textbox", { name: "Account name" })).toBeInTheDocument();
  });

  it("describes the control with its hint and error", () => {
    render(
      <Field label="Amount" hint="Leave out the peso sign." error="Enter an amount above zero.">
        <CurrencyInput />
      </Field>
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveAccessibleDescription(
      "Leave out the peso sign. Enter an amount above zero."
    );
  });

  it("marks the control invalid only while there is an error", () => {
    const { rerender } = render(
      <Field label="Account name" hint="Shown on every transaction.">
        <Input />
      </Field>
    );
    const control = screen.getByRole("textbox", { name: "Account name" });
    expect(control).not.toHaveAttribute("aria-invalid");
    expect(control).toHaveAccessibleDescription("Shown on every transaction.");

    rerender(
      <Field label="Account name" hint="Shown on every transaction." error="Name the account.">
        <Input />
      </Field>
    );
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Name the account.")).toBeInTheDocument();

    rerender(
      <Field label="Account name" hint="Shown on every transaction.">
        <Input />
      </Field>
    );
    expect(control).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Name the account.")).not.toBeInTheDocument();
  });

  it("keeps a description the control already had", () => {
    render(
      <>
        <p id="balance-note">Counted from today.</p>
        <Field label="Opening balance" hint="What the bank shows now.">
          <Input aria-describedby="balance-note" />
        </Field>
      </>
    );
    expect(screen.getByRole("textbox", { name: "Opening balance" })).toHaveAccessibleDescription(
      "Counted from today. What the bank shows now."
    );
  });

  it("hands the wiring to a control nested inside a wrapper", () => {
    render(
      <Field label="Category" error="Pick a category.">
        {(control) => (
          <Select>
            <SelectTrigger {...control}>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="food">Food</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
    );
    const trigger = screen.getByRole("combobox", { name: "Category" });
    expect(trigger).toHaveAccessibleDescription("Pick a category.");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
  });
});
