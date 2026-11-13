import type React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/test/viewport";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Drawer, DrawerContent, DrawerTitle } from "./drawer";
import { Sheet, SheetContent, SheetTitle } from "./sheet";
import { Toaster } from "./sonner";

/** Compact windows end at 599px; 600px is the first medium width. */
const setPhone = (isPhone: boolean) => setViewportWidth(isPhone ? 599 : 600);

const toaster = () => document.querySelector("[data-sonner-toaster]");

async function showToast() {
  render(<Toaster />);
  act(() => void toast("Transaction added"));
  await screen.findByText("Transaction added");
}

beforeEach(() => setPhone(true));

afterEach(() => {
  document.body.removeAttribute("data-scroll-locked");
  toast.dismiss();
  vi.restoreAllMocks();
});

describe("Toaster", () => {
  it("sits at the bottom of a phone while no sheet is open", async () => {
    await showToast();
    expect(toaster()).toHaveAttribute("data-y-position", "bottom");
  });

  it("moves to the top of a phone while a sheet is open, and back when it closes", async () => {
    await showToast();

    await act(async () => document.body.setAttribute("data-scroll-locked", "1"));
    expect(toaster()).toHaveAttribute("data-y-position", "top");

    await act(async () => document.body.removeAttribute("data-scroll-locked"));
    expect(toaster()).toHaveAttribute("data-y-position", "bottom");
  });

  it("stays at the bottom on wider screens, where forms open as centered dialogs", async () => {
    setPhone(false);
    await showToast();

    await act(async () => document.body.setAttribute("data-scroll-locked", "1"));
    expect(toaster()).toHaveAttribute("data-y-position", "bottom");
  });
});

describe("a toast's action above an open modal layer", () => {
  const layers: Record<string, (onOpenChange: (open: boolean) => void) => React.ReactNode> = {
    dialog: (onOpenChange) => (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Food</DialogTitle>
        </DialogContent>
      </Dialog>
    ),
    sheet: (onOpenChange) => (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Food</SheetTitle>
        </SheetContent>
      </Sheet>
    ),
    "phone sheet": (onOpenChange) => (
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Food</DrawerTitle>
        </DrawerContent>
      </Drawer>
    ),
  };

  it.each(Object.entries(layers))("takes one tap and keeps the %s open", async (_, layer) => {
    const onOpenChange = vi.fn();
    const undo = vi.fn();
    render(
      <>
        <Toaster />
        {layer(onOpenChange)}
      </>
    );
    act(() => void toast("Allocation removed", { action: { label: "Undo", onClick: undo } }));

    const undoButton = await screen.findByRole("button", { name: "Undo" });
    // An open modal turns off pointer events on the page; a tap must still reach the toast.
    expect(window.getComputedStyle(undoButton).pointerEvents).not.toBe("none");
    fireEvent.pointerDown(undoButton);
    fireEvent.click(undoButton);

    expect(undo).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
