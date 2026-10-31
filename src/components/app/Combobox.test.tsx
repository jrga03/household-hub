import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { COMPACT_QUERY } from "@/hooks/useMediaQuery";
import { Combobox, type ComboboxGroup } from "./Combobox";

const groups: ComboboxGroup[] = [
  {
    label: "Food",
    options: [
      { value: "groceries", label: "Groceries" },
      { value: "dining", label: "Dining out" },
    ],
  },
  { label: "Bills", options: [{ value: "power", label: "Electricity" }] },
];
const UNASSIGNED = { value: "unassigned", label: "Unassigned" };

function CategoryPicker({ required = false }: { required?: boolean }) {
  const [value, setValue] = useState(required ? "groceries" : "unassigned");
  return (
    <form aria-label="Picker">
      <Combobox
        aria-label="Category"
        name="categoryId"
        value={value}
        onValueChange={setValue}
        groups={groups}
        empty={required ? undefined : UNASSIGNED}
      />
      <input aria-label="Description" />
    </form>
  );
}

const field = () => screen.getByRole("combobox", { name: "Category" });
const optionNames = () => screen.queryAllByRole("option").map((option) => option.textContent);
const submitted = () =>
  new FormData(screen.getByRole("form", { name: "Picker" }) as HTMLFormElement).get("categoryId");

describe("Combobox on wider screens", () => {
  const open = () => fireEvent.click(field());
  const search = (query: string) =>
    fireEvent.change(screen.getByRole("combobox", { name: "Search" }), {
      target: { value: query },
    });

  it("reads the empty choice in the field and lists it first", () => {
    render(<CategoryPicker />);
    expect(field()).toHaveTextContent("Unassigned");
    open();
    expect(optionNames()).toEqual(["Unassigned", "Groceries", "Dining out", "Electricity"]);
  });

  it("narrows the list to the categories a query names, in bold", () => {
    render(<CategoryPicker />);
    open();
    search("groc");
    expect(optionNames()).toEqual(["Groceries"]);
    expect(within(screen.getByRole("option")).getByText("Groc").tagName).toBe("STRONG");
  });

  it("lists every category in a group the query names, and hides the other groups", () => {
    render(<CategoryPicker />);
    open();
    search("food");
    expect(optionNames()).toEqual(["Groceries", "Dining out"]);
    expect(screen.queryByText("Bills")).not.toBeInTheDocument();
  });

  it("finds the empty choice by its label", () => {
    render(<CategoryPicker />);
    open();
    search("unass");
    expect(optionNames()).toEqual(["Unassigned"]);
  });

  it("says so when nothing matches", () => {
    render(<CategoryPicker />);
    open();
    search("zzz");
    expect(optionNames()).toEqual([]);
    expect(screen.getByText("No matches")).toBeVisible();
  });

  describe("focus on open", () => {
    it("goes to the search field with a mouse or trackpad", () => {
      render(<CategoryPicker />);
      fireEvent.pointerDown(field(), { pointerType: "mouse" });
      fireEvent.click(field());
      expect(screen.getByRole("combobox", { name: "Search" })).toHaveFocus();
    });

    it("stays off the search field on touch, so no keyboard pops up", () => {
      render(<CategoryPicker />);
      fireEvent.pointerDown(field(), { pointerType: "touch" });
      fireEvent.click(field());
      expect(screen.getByRole("combobox", { name: "Search" })).not.toHaveFocus();
    });

    it("goes to the search field when a key opens it on a touch device", () => {
      render(<CategoryPicker />);
      fireEvent.pointerDown(field(), { pointerType: "touch" });
      fireEvent.click(field());
      fireEvent.keyDown(screen.getByRole("combobox", { name: "Search" }), { key: "Escape" });
      fireEvent.keyDown(field(), { key: "Enter" });
      fireEvent.click(field());
      expect(screen.getByRole("combobox", { name: "Search" })).toHaveFocus();
    });
  });

  it("picks with the arrows and Enter, and submits the value under its name", () => {
    render(<CategoryPicker />);
    open();
    const input = screen.getByRole("combobox", { name: "Search" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(field()).toHaveTextContent("Groceries");
    expect(submitted()).toBe("groceries");
  });

  it("closes on Escape and gives focus back to the field", async () => {
    render(<CategoryPicker />);
    open();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search" }), { key: "Escape" });
    expect(screen.queryByRole("combobox", { name: "Search" })).not.toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveFocus());
  });
});

describe("Combobox on phones", () => {
  afterEach(() => vi.restoreAllMocks());

  function renderOnPhone(required = false) {
    const matchMedia = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      ...matchMedia(query),
      matches: query === COMPACT_QUERY,
    }));
    render(<CategoryPicker required={required} />);
  }
  const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
  const leave = () => fireEvent.blur(field());

  it("is a text field that shows the choice, or the empty choice as its placeholder", () => {
    renderOnPhone();
    expect(field()).toHaveValue("");
    expect(field()).toHaveAttribute("placeholder", "Unassigned");
  });

  it("opens the list on a tap and filters it by typing, in bold", () => {
    renderOnPhone();
    fireEvent.click(field());
    expect(optionNames()).toEqual(["Groceries", "Dining out", "Electricity"]);
    type("food");
    expect(optionNames()).toEqual(["Groceries", "Dining out"]);
    type("groc");
    expect(within(screen.getByRole("option")).getByText("Groc").tagName).toBe("STRONG");
  });

  it("picks a tapped option", () => {
    renderOnPhone();
    type("dining");
    fireEvent.click(screen.getByRole("option", { name: "Dining out" }));
    expect(field()).toHaveValue("Dining out");
    expect(submitted()).toBe("dining");
  });

  it("empties to the empty choice with the clear button", () => {
    renderOnPhone();
    type("groc");
    fireEvent.click(screen.getByRole("option", { name: "Groceries" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(field()).toHaveValue("");
    expect(submitted()).toBe("unassigned");
  });

  it("goes back to the last choice when the text matches nothing", () => {
    renderOnPhone(true);
    type("zzz");
    leave();
    expect(field()).toHaveValue("Groceries");
    expect(submitted()).toBe("groceries");
  });

  it("picks the option the text names exactly", () => {
    renderOnPhone(true);
    type("electricity");
    leave();
    expect(field()).toHaveValue("Electricity");
    expect(submitted()).toBe("power");
  });

  it("keeps a required choice when the text is emptied, and has no clear button", () => {
    renderOnPhone(true);
    expect(screen.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();
    type("");
    leave();
    expect(field()).toHaveValue("Groceries");
  });

  it("opens the list with Enter instead of submitting the form", () => {
    renderOnPhone();
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    screen.getByRole("form", { name: "Picker" }).addEventListener("submit", submit);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field()).toHaveAttribute("aria-expanded", "true");
    expect(submit).not.toHaveBeenCalled();
  });

  it("picks the highlighted option with Enter", () => {
    renderOnPhone();
    type("elec");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field()).toHaveValue("Electricity");
    expect(submitted()).toBe("power");
  });
});
