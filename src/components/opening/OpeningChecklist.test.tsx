import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { parsePHP } from "@/lib/currency";
import { useOpeningSteps } from "@/hooks/useOpeningSteps";
import { OpeningChecklist } from "./OpeningChecklist";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

// Rendered beside the checklist so a test can wait until the steps have loaded.
function StepsLoaded() {
  return useOpeningSteps() ? <p>Steps loaded</p> : null;
}

function renderHome() {
  const rootRoute = createRootRoute();
  const routes = ["/", "/distribute", "/categories", "/accounts"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <>
          <StepsLoaded />
          <OpeningChecklist householdId={HOUSEHOLD} />
        </>
      ),
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

const checklist = () => screen.findByRole("list", { name: "Opening checklist" });

beforeEach(async () => {
  await resetLocalDatabase();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpeningChecklist", () => {
  it("ticks off starting balances and opens Distribute in opening mode on that account", async () => {
    const bpi = await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("40000"),
    });
    renderHome();

    const steps = within(await checklist()).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining("(done)"),
      expect.stringContaining("(to do)"),
      expect.stringContaining("(to do)"),
    ]);
    expect(await screen.findByRole("link", { name: "Distribute" })).toHaveAttribute(
      "href",
      `/distribute?mode=opening&account=${bpi.id}`
    );
  });

  it("sends an empty household to the add-account form on Accounts", async () => {
    renderHome();

    expect(await screen.findByRole("link", { name: "Add an account" })).toHaveAttribute(
      "href",
      "/accounts#add-account"
    );
  });

  it("stays dismissed on this device", async () => {
    const { unmount } = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss the opening checklist" }));
    expect(screen.queryByRole("list", { name: "Opening checklist" })).not.toBeInTheDocument();
    unmount();

    renderHome();
    await screen.findByText("Steps loaded");
    expect(screen.queryByRole("list", { name: "Opening checklist" })).not.toBeInTheDocument();
  });

  it("still shows and dismisses when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    renderHome();

    await checklist();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss the opening checklist" }));
    expect(screen.queryByRole("list", { name: "Opening checklist" })).not.toBeInTheDocument();
  });
});
