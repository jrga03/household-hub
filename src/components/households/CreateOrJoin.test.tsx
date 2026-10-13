import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { MyJoinRequest } from "@/lib/join-requests";
import { CreateOrJoinChoices } from "./CreateOrJoin";

const USER_ID = "user-a";

function renderChoices(request: MyJoinRequest | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(["my-join-request", USER_ID], request);
  queryClient.setQueryData(["household", USER_ID], null);

  const rootRoute = createRootRoute();
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: "/create-or-join",
    component: () => <CreateOrJoinChoices userId={USER_ID} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/create-or-join"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const pressTab = (name: string) => {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
};

describe("CreateOrJoinChoices", () => {
  it("shows the create form first and swaps to the join form on the toggle", async () => {
    renderChoices(null);

    expect(await screen.findByLabelText("Household name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Household Code")).not.toBeInTheDocument();

    pressTab("Join");

    expect(await screen.findByLabelText("Household Code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Household name")).not.toBeInTheDocument();
  });

  it("opens on Join with the pending request and keeps Create closed until it is answered", async () => {
    renderChoices({ id: "request-1", status: "pending" });

    expect(await screen.findByRole("heading", { name: "Request sent" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Join" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Create" })).toBeDisabled();
    expect(screen.queryByLabelText("Household Code")).not.toBeInTheDocument();
  });

  it("opens on Join with the declined request until it is acknowledged", async () => {
    renderChoices({ id: "request-1", status: "declined" });

    expect(
      await screen.findByRole("heading", { name: "Request not accepted" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Join" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Create" })).toBeDisabled();
  });
});
