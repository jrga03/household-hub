/**
 * Tests for the app-level confirm() mechanism (review R39): the imperative
 * `confirm()` in @/lib/confirm renders through the single ConfirmDialogHost
 * as a Radix AlertDialog and resolves the caller's promise from the buttons.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmDialogHost } from "./ConfirmDialog";
import { confirm, confirmWithOutcome, useConfirmStore } from "@/lib/confirm";

beforeEach(() => {
  // Settle any request left over from a previous test
  useConfirmStore.getState().settle("dismiss");
});

describe("confirm() + ConfirmDialogHost", () => {
  it("renders title, description, and custom labels in an alertdialog", async () => {
    render(<ConfirmDialogHost />);

    void confirm({
      title: "Delete this budget?",
      description: "The budget target is removed.",
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
    });

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete this budget?");
    expect(dialog).toHaveTextContent("The budget target is removed.");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  });

  it("resolves true when the confirm action is clicked", async () => {
    render(<ConfirmDialogHost />);

    const result = confirm({ title: "Proceed?" });

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await expect(result).resolves.toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("resolves false when cancelled", async () => {
    render(<ConfirmDialogHost />);

    const result = confirm({ title: "Proceed?" });

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await expect(result).resolves.toBe(false);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("resolves false when dismissed via Escape", async () => {
    render(<ConfirmDialogHost />);

    const result = confirm({ title: "Proceed?" });

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await expect(result).resolves.toBe(false);
  });

  it("cancels a pending request when a new one arrives (no orphaned promise)", async () => {
    render(<ConfirmDialogHost />);

    const first = confirm({ title: "First?" });
    const second = confirm({ title: "Second?" });

    await expect(first).resolves.toBe(false);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await expect(second).resolves.toBe(true);
  });
});

describe("confirmWithOutcome() (three-way outcome)", () => {
  it("resolves 'confirm' from the action button", async () => {
    render(<ConfirmDialogHost />);

    const result = confirmWithOutcome({ title: "Proceed?" });

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await expect(result).resolves.toBe("confirm");
  });

  it("resolves 'cancel' from the explicit cancel button", async () => {
    render(<ConfirmDialogHost />);

    const result = confirmWithOutcome({ title: "Proceed?" });

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await expect(result).resolves.toBe("cancel");
  });

  it("resolves 'dismiss' when closed via Escape — distinct from cancel", async () => {
    render(<ConfirmDialogHost />);

    const result = confirmWithOutcome({ title: "Proceed?" });

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await expect(result).resolves.toBe("dismiss");
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
