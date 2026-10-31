import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { Combobox, type ComboboxGroup } from "./Combobox";

const groups: ComboboxGroup[] = [
  { options: [{ value: "unassigned", label: "Unassigned" }] },
  {
    label: "Food",
    options: [
      { value: "groceries", label: "Groceries" },
      { value: "dining", label: "Dining out" },
    ],
  },
  { label: "Bills", options: [{ value: "power", label: "Electricity" }] },
];

function CategoryPicker() {
  const [value, setValue] = useState("unassigned");
  return (
    <Combobox
      aria-label="Category"
      name="categoryId"
      value={value}
      onValueChange={setValue}
      groups={groups}
    />
  );
}

const open = () => fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
const search = (query: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: query } });
const optionNames = () => screen.queryAllByRole("option").map((option) => option.textContent);

describe("Combobox", () => {
  it("narrows the list to the categories a query names", () => {
    render(<CategoryPicker />);
    open();
    search("groc");
    expect(optionNames()).toEqual(["Groceries"]);
  });

  it("lists every category in a group the query names, and hides the other groups", () => {
    render(<CategoryPicker />);
    open();
    search("food");
    expect(optionNames()).toEqual(["Groceries", "Dining out"]);
    expect(screen.getByText("Bills")).not.toBeVisible();
  });

  it("finds the special options by their label", () => {
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
      const trigger = screen.getByRole("combobox", { name: "Category" });
      fireEvent.pointerDown(trigger, { pointerType: "mouse" });
      fireEvent.click(trigger);
      expect(screen.getByPlaceholderText("Search…")).toHaveFocus();
    });

    it("stays off the search field on touch, so no keyboard pops up", () => {
      render(<CategoryPicker />);
      const trigger = screen.getByRole("combobox", { name: "Category" });
      fireEvent.pointerDown(trigger, { pointerType: "touch" });
      fireEvent.click(trigger);
      expect(screen.getByPlaceholderText("Search…")).not.toHaveFocus();
    });

    it("goes to the search field when a key opens it on a touch device", () => {
      render(<CategoryPicker />);
      const trigger = screen.getByRole("combobox", { name: "Category" });
      fireEvent.pointerDown(trigger, { pointerType: "touch" });
      fireEvent.click(trigger);
      fireEvent.keyDown(screen.getByPlaceholderText("Search…"), { key: "Escape" });
      fireEvent.keyDown(trigger, { key: "Enter" });
      fireEvent.click(trigger);
      expect(screen.getByPlaceholderText("Search…")).toHaveFocus();
    });
  });

  it("picks with the arrows and Enter, and submits the value under its name", () => {
    const { container } = render(<CategoryPicker />);
    open();
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    const trigger = screen.getByRole("combobox", { name: "Category" });
    expect(trigger).toHaveTextContent("Groceries");
    expect(container.querySelector('input[name="categoryId"]')).toHaveValue("groceries");
  });

  it("closes on Escape and gives focus back to the trigger", async () => {
    render(<CategoryPicker />);
    open();
    fireEvent.keyDown(screen.getByPlaceholderText("Search…"), { key: "Escape" });
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Category" })).toHaveFocus());
  });
});
