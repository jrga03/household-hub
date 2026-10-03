import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import {
  fetchBudgetGroupsFromServer,
  fetchCategoryTotalsFromServer,
  fetchDashboardDataFromServer,
} from "@/lib/supabaseQueries";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/lib/offline/budgets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/budgets")>()),
  mirrorBudgetsForMonth: vi.fn(),
}));

// Relations are asserted in call order so swapping which query reads the view fails.
// Every query resolves to an empty result; only the relation names matter here.
function recordRelations(): string[] {
  const relations: string[] = [];
  const empty = { data: [], error: null };
  const builder: object = new Proxy(
    {},
    {
      get: (_target, property) =>
        property === "then" ? (resolve: (value: unknown) => void) => resolve(empty) : () => builder,
    }
  );
  vi.mocked(supabase.from).mockImplementation(((relation: string) => {
    relations.push(relation);
    return builder;
  }) as never);
  vi.mocked(supabase.rpc).mockResolvedValue(empty as never);
  return relations;
}

const month = new Date(2026, 9, 1);

describe("totals read transactions only through transactions_non_transfer", () => {
  it.each([
    // The dashboard's "recent transactions" list shows transfers on purpose.
    [
      "dashboard",
      () => fetchDashboardDataFromServer(month),
      [
        "transactions_non_transfer",
        "transactions_non_transfer",
        "transactions_non_transfer",
        "categories",
        "accounts",
        "transactions",
      ],
    ],
    [
      "category totals",
      () => fetchCategoryTotalsFromServer(month),
      ["categories", "transactions_non_transfer"],
    ],
    [
      "budget groups",
      () => fetchBudgetGroupsFromServer(month),
      ["budgets", "categories", "transactions_non_transfer"],
    ],
  ])("%s", async (_name, fetchTotals, expected) => {
    const relations = recordRelations();

    await fetchTotals();

    expect(relations).toEqual(expected);
  });
});
