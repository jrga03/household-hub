/**
 * Tests for CurrencyInput (mobile UX review R22):
 * commits parsed cents on every change, not just blur, so Enter-submit
 * validates the typed amount and live previews (e.g. debt balance) track
 * typing. The format-on-blur effect is gated on !isFocused, so committing
 * per keystroke must never reformat (clobber) the text mid-typing.
 */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurrencyInput } from "./currency-input";

function getInput(): HTMLInputElement {
  return screen.getByLabelText("Amount in Philippine Pesos");
}

/** Controlled harness mirroring the RHF Controller wiring used by the forms. */
function ControlledCurrencyInput({ onChangeSpy }: { onChangeSpy: (cents: number) => void }) {
  const [value, setValue] = useState(0);
  return (
    <CurrencyInput
      value={value}
      onChange={(cents) => {
        setValue(cents);
        onChangeSpy(cents);
      }}
    />
  );
}

describe("CurrencyInput", () => {
  it("commits parsed cents on change, before any blur", () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} />);

    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1,500.50" } });

    expect(onChange).toHaveBeenLastCalledWith(150050);
  });

  it("keeps committing as the user types, without reformatting the typed text", () => {
    const onChange = vi.fn();
    render(<ControlledCurrencyInput onChangeSpy={onChange} />);

    const input = getInput();
    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: "1" } });
    expect(onChange).toHaveBeenLastCalledWith(100);
    expect(input.value).toBe("1");

    // Partial decimal input parses ("1." -> 100 cents) and is NOT clobbered
    // by the format-on-blur effect while focused
    fireEvent.change(input, { target: { value: "1." } });
    expect(onChange).toHaveBeenLastCalledWith(100);
    expect(input.value).toBe("1.");

    fireEvent.change(input, { target: { value: "1.5" } });
    expect(onChange).toHaveBeenLastCalledWith(150);
    expect(input.value).toBe("1.5");
  });

  it("commits 0 when the field is cleared", () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={150050} onChange={onChange} />);

    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });

    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("silently ignores unparseable input on change and resets it on blur", () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={12345} onChange={onChange} />);

    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc" } });

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    // Display resets to the last committed value
    expect(input.value).toBe("123.45");
  });

  it("commits the over-max cents value instead of leaving a truncated prefix committed", () => {
    const onChange = vi.fn();
    render(<ControlledCurrencyInput onChangeSpy={onChange} />);

    const input = getInput();
    fireEvent.focus(input);

    // Last parseable prefix: ₱9,999,999 (999999900 cents, within max)
    fireEvent.change(input, { target: { value: "9999999" } });
    expect(onChange).toHaveBeenLastCalledWith(999999900);

    // One more digit exceeds MAX_AMOUNT_CENTS. parsePHP throws, but the
    // over-max cents value must still be committed so the schema-level
    // .max() rule rejects submit — NOT silently left at ₱9,999,999 while
    // the input displays ₱99,999,999.
    fireEvent.change(input, { target: { value: "99999999" } });
    expect(onChange).toHaveBeenLastCalledWith(9999999900);
    expect(input.value).toBe("99999999");
  });

  it("passes through host-injected aria wiring when no error prop is set", () => {
    render(
      <CurrencyInput
        value={0}
        onChange={() => {}}
        aria-invalid={true}
        aria-describedby="form-item-message"
      />
    );

    // shadcn FormControl injects these; CurrencyInput must not clobber them
    const input = getInput();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "form-item-message");
  });

  it("overrides aria wiring and renders its own message when the error prop is set", () => {
    render(
      <CurrencyInput
        id="amount"
        value={0}
        onChange={() => {}}
        aria-describedby="form-item-message"
        error="Amount too large"
      />
    );

    const input = getInput();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "amount-error");
    expect(screen.getByText("Amount too large")).toHaveAttribute("id", "amount-error");
  });

  it("formats the display value on blur", () => {
    const onChange = vi.fn();
    render(<ControlledCurrencyInput onChangeSpy={onChange} />);

    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1500.5" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith(150050);
    expect(input.value).toBe("1,500.50");
  });
});
