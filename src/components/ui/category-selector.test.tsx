/**
 * Tests for CategorySelector (mobile UX review, item 6.8):
 * - Popover + Command combobox replaces the flat Radix Select
 * - two-level hierarchy preserved (parent group headings, children as rows)
 * - search filters across parent/child names, case/diacritic-insensitive
 * - "Recent" group derived from the Dexie transactions table (distinct,
 *   newest first, transfers excluded, gracefully absent with no data)
 * - selection fires the same onChange(categoryId) contract as before
 * - keyboard navigation (ArrowDown + Enter) selects
 * - loading state disables the trigger
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CategorySelector } from "./category-selector";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import type { Category, CategoryWithChildren } from "@/types/categories";

// ---------------------------------------------------------------------------
// Environment stubs: jsdom lacks these; Radix Popper + cmdk require them
// ---------------------------------------------------------------------------

beforeAll(() => {
  window.Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ---------------------------------------------------------------------------
// Category fixtures (via mocked useCategoriesGrouped - the component's only
// supabaseQueries dependency). "Café" exercises diacritic-insensitive search.
// ---------------------------------------------------------------------------

function buildCategory(id: string, name: string, parent_id: string | null = null): Category {
  return {
    id,
    household_id: "hh-1",
    parent_id,
    name,
    color: "#EF4444",
    icon: "folder",
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const groupedFixtures: CategoryWithChildren[] = [
  {
    ...buildCategory("parent-food", "Food"),
    children: [
      buildCategory("cat-groceries", "Groceries", "parent-food"),
      buildCategory("cat-cafe", "Café", "parent-food"),
    ],
  },
  {
    ...buildCategory("parent-transport", "Transport"),
    children: [buildCategory("cat-fuel", "Fuel", "parent-transport")],
  },
];

const mockCategoriesGrouped = vi.fn(
  (): { data: CategoryWithChildren[] | undefined; isLoading: boolean } => ({
    data: groupedFixtures,
    isLoading: false,
  })
);

vi.mock("@/lib/supabaseQueries", () => ({
  useCategoriesGrouped: () => mockCategoriesGrouped(),
}));

// ---------------------------------------------------------------------------
// Dexie fixtures: the Recent group reads the REAL db (fake-indexeddb)
// ---------------------------------------------------------------------------

function buildTransaction(
  overrides: Partial<LocalTransaction> & { id: string; created_at: string }
): LocalTransaction {
  return {
    household_id: "hh-1",
    date: "2026-07-01",
    description: "test txn",
    amount_cents: 10000,
    type: "expense",
    currency_code: "PHP",
    status: "cleared",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    device_id: "dev-1",
    updated_at: overrides.created_at,
    ...overrides,
  };
}

async function seedRecentTransactions() {
  await db.transactions.bulkAdd([
    // Newest overall, but a transfer leg - must NOT surface in Recent
    buildTransaction({
      id: "txn-transfer",
      created_at: "2026-07-07T12:00:00Z",
      category_id: "cat-cafe",
      transfer_group_id: "tg-1",
    }),
    // Groceries used twice - must appear ONCE, ranked by newest use
    buildTransaction({
      id: "txn-groceries-new",
      created_at: "2026-07-07T10:00:00Z",
      category_id: "cat-groceries",
    }),
    buildTransaction({
      id: "txn-fuel",
      created_at: "2026-07-06T10:00:00Z",
      category_id: "cat-fuel",
    }),
    buildTransaction({
      id: "txn-groceries-old",
      created_at: "2026-07-05T10:00:00Z",
      category_id: "cat-groceries",
    }),
    // No category - ignored
    buildTransaction({ id: "txn-uncategorized", created_at: "2026-07-04T10:00:00Z" }),
  ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTrigger(): HTMLElement {
  return screen.getByRole("combobox");
}

async function openPicker() {
  fireEvent.click(getTrigger());
  return await screen.findByPlaceholderText("Search categories...");
}

/** All visible option labels, in DOM order. */
function visibleOptionNames(): string[] {
  return screen.getAllByRole("option").map((option) => option.textContent ?? "");
}

/** The [cmdk-group] element whose heading matches, for scoped queries. */
function getGroup(heading: string): HTMLElement {
  const headingEl = Array.from(document.querySelectorAll("[cmdk-group-heading]")).find(
    (el) => el.textContent === heading
  );
  if (!headingEl) throw new Error(`No cmdk group with heading "${heading}"`);
  return headingEl.closest("[cmdk-group]") as HTMLElement;
}

beforeEach(async () => {
  mockCategoriesGrouped.mockReturnValue({ data: groupedFixtures, isLoading: false });
  await db.transactions.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CategorySelector combobox", () => {
  it("renders the placeholder on the trigger and the grouped hierarchy when opened", async () => {
    render(<CategorySelector value={undefined} onChange={() => {}} />);

    expect(getTrigger()).toHaveTextContent("Select category");

    await openPicker();

    // Parent names are group headings, not selectable options
    const headings = Array.from(document.querySelectorAll("[cmdk-group-heading]")).map(
      (el) => el.textContent
    );
    expect(headings).toEqual(["Food", "Transport"]);

    // Children render as options under their parent group
    expect(within(getGroup("Food")).getByText("Groceries")).toBeInTheDocument();
    expect(within(getGroup("Food")).getByText("Café")).toBeInTheDocument();
    expect(within(getGroup("Transport")).getByText("Fuel")).toBeInTheDocument();
  });

  it("respects a custom placeholder and shows the selected category on the trigger", () => {
    const { rerender } = render(
      <CategorySelector value={undefined} onChange={() => {}} placeholder="All categories" />
    );
    expect(getTrigger()).toHaveTextContent("All categories");

    rerender(
      <CategorySelector value="cat-groceries" onChange={() => {}} placeholder="All categories" />
    );
    expect(getTrigger()).toHaveTextContent("Groceries");
  });

  it("filters by child name, case-insensitively", async () => {
    render(<CategorySelector value={undefined} onChange={() => {}} />);
    const input = await openPicker();

    fireEvent.change(input, { target: { value: "GROC" } });

    await waitFor(() => expect(visibleOptionNames()).toEqual(["Groceries"]));
    expect(screen.queryByText("Fuel")).not.toBeInTheDocument();
  });

  it("filters diacritic-insensitively (cafe matches Café)", async () => {
    render(<CategorySelector value={undefined} onChange={() => {}} />);
    const input = await openPicker();

    fireEvent.change(input, { target: { value: "cafe" } });

    await waitFor(() => expect(visibleOptionNames()).toEqual(["Café"]));
  });

  it("matches on the parent name too, and shows an empty state for no matches", async () => {
    render(<CategorySelector value={undefined} onChange={() => {}} />);
    const input = await openPicker();

    fireEvent.change(input, { target: { value: "transport" } });
    await waitFor(() => expect(visibleOptionNames()).toEqual(["Fuel"]));

    fireEvent.change(input, { target: { value: "zzz-no-match" } });
    await waitFor(() => expect(screen.getByText("No categories found.")).toBeInTheDocument());
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("renders the Recent group from Dexie data: distinct, newest first, transfers excluded", async () => {
    await seedRecentTransactions();
    render(<CategorySelector value={undefined} onChange={() => {}} />);
    await openPicker();

    await screen.findByText("Recent");
    const recentGroup = getGroup("Recent");
    const recentNames = within(recentGroup)
      .getAllByRole("option")
      .map((option) => option.textContent);

    // Groceries once (deduped, ranked by its newest use), then Fuel.
    // The newest transaction overall is a transfer leg tagged Café - the
    // analytics-exclusion rule (transfer_group_id) keeps it out of Recent.
    expect(recentNames).toEqual(["Groceries", "Fuel"]);
  });

  it("omits the Recent group entirely when there are no local transactions", async () => {
    render(<CategorySelector value={undefined} onChange={() => {}} />);
    await openPicker();

    // Hierarchy is present, Recent is not
    expect(await screen.findByText("Fuel")).toBeInTheDocument();
    expect(screen.queryByText("Recent")).not.toBeInTheDocument();
  });

  it("fires onChange with the category id and closes when an option is tapped", async () => {
    const onChange = vi.fn();
    render(<CategorySelector value={undefined} onChange={onChange} />);
    await openPicker();

    fireEvent.click(within(getGroup("Food")).getByText("Groceries"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("cat-groceries");
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Search categories...")).not.toBeInTheDocument()
    );
  });

  it("fires onChange with the REAL category id when selecting from the Recent group", async () => {
    await seedRecentTransactions();
    const onChange = vi.fn();
    render(<CategorySelector value={undefined} onChange={onChange} />);
    await openPicker();

    await screen.findByText("Recent");
    fireEvent.click(within(getGroup("Recent")).getByText("Fuel"));

    // Not the prefixed cmdk value ("recent:cat-fuel")
    expect(onChange).toHaveBeenCalledWith("cat-fuel");
  });

  it("supports keyboard navigation: arrows move the highlight, Enter commits", async () => {
    const onChange = vi.fn();
    render(<CategorySelector value={undefined} onChange={onChange} />);
    const input = await openPicker();

    // cmdk auto-highlights the first option (Groceries) on open;
    // ArrowDown moves the highlight to the second (Café), Enter commits it
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("cat-cafe"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("disables the trigger and shows the loading label while categories load", () => {
    mockCategoriesGrouped.mockReturnValue({ data: undefined, isLoading: true });
    render(<CategorySelector value={undefined} onChange={() => {}} />);

    const trigger = getTrigger();
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("Loading categories...");
  });

  it("disables the trigger when the disabled prop is set", () => {
    render(<CategorySelector value={undefined} onChange={() => {}} disabled />);
    expect(getTrigger()).toBeDisabled();
  });
});
