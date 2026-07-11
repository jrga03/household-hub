/**
 * Tests for TransferForm (mobile UX review R21):
 * the default (and post-submit reset) date must be the user's LOCAL calendar
 * day. The old `new Date().toISOString().split("T")[0]` produced the UTC day,
 * which is yesterday before 8am for UTC+8 users.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransferForm } from "./TransferForm";

// Radix Select measures its trigger via ResizeObserver, which jsdom lacks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

vi.mock("@/hooks/useTransfers", () => ({
  useCreateTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeAll(() => {
  // Fix a UTC+8 timezone and an instant where the UTC day is still
  // "yesterday": 2026-03-15T23:00Z == 2026-03-16 07:00 in Asia/Manila.
  // Node re-reads TZ on assignment since v13.
  vi.stubEnv("TZ", "Asia/Manila");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-15T23:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("TransferForm", () => {
  it("defaults the date to the local calendar day, not the UTC day", () => {
    render(
      <TransferForm
        accounts={[
          { id: "acc-1", name: "Checking" },
          { id: "acc-2", name: "Savings" },
        ]}
        householdId="hh-1"
        userId="user-1"
      />
    );

    // Sanity check the trap this guards against: the UTC day differs here
    expect(new Date().toISOString().split("T")[0]).toBe("2026-03-15");

    const dateInput = screen.getByLabelText("Date") as HTMLInputElement;
    expect(dateInput.value).toBe("2026-03-16");
  });
});
