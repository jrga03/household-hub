import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "./sonner";

let phone = true;
vi.mock("@/hooks/useMediaQuery", () => ({ useIsMobile: () => phone }));

const toaster = () => document.querySelector("[data-sonner-toaster]");

async function showToast() {
  render(<Toaster />);
  act(() => void toast("Transaction added"));
  await screen.findByText("Transaction added");
}

afterEach(() => {
  document.body.removeAttribute("data-scroll-locked");
  toast.dismiss();
  phone = true;
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
    phone = false;
    await showToast();

    await act(async () => document.body.setAttribute("data-scroll-locked", "1"));
    expect(toaster()).toHaveAttribute("data-y-position", "bottom");
  });
});
