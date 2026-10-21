import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { readCategoryList } from "@/lib/categories/projection";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { CategoriesView } from "./CategoriesView";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

beforeEach(async () => {
  await resetLocalDatabase();
});

async function foodWithGroceries() {
  const food = await createGroup(MEMBER, { name: "Food" });
  const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
  return { food, groceries };
}

describe("CategoriesView", () => {
  it("shows each group as a section headed by its name, with its categories as rows", async () => {
    await foodWithGroceries();
    render(<CategoriesView actor={MEMBER} />);

    const food = await screen.findByRole("region", { name: "Food" });
    expect(within(food).getByRole("heading", { name: "Food" })).toBeInTheDocument();
    const categories = within(food).getByRole("list", { name: "Food categories" });
    expect(within(categories).getByRole("button", { name: "Edit Groceries" })).toBeInTheDocument();
    expect(within(food).getByRole("button", { name: "Edit group Food" })).toBeInTheDocument();
  });

  it("renames a category from its row's sheet", async () => {
    const { groceries } = await foodWithGroceries();
    render(<CategoriesView actor={MEMBER} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Groceries" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit category" });
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "Market" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const list = await readCategoryList();
      expect(list.groups[0]?.categories.find((row) => row.id === groceries.id)?.name).toBe(
        "Market"
      );
    });
    await waitFor(() => expect(sheet).not.toBeInTheDocument());
  });

  it("asks for a group next to the Group field when a category is added without one", async () => {
    await foodWithGroceries();
    render(<CategoriesView actor={MEMBER} />);

    const form = await screen.findByRole("form", { name: "Add a category" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Name" }), {
      target: { value: "Snacks" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Add category" }));

    const group = await within(form).findByRole("combobox", { name: "Group" });
    await waitFor(() => expect(group).toHaveAttribute("aria-invalid", "true"));
    expect(group).toHaveAccessibleDescription("Choose a group.");
  });
});
