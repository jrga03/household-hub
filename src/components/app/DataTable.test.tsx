import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "./DataTable";

interface Payment {
  id: string;
  description: string;
  account: string;
  amount: string;
}

const payments: Payment[] = [
  { id: "p1", description: "Groceries", account: "Cash", amount: "₱250.00" },
  { id: "p2", description: "Rent", account: "BPI", amount: "₱12,000.00" },
];

const columns: DataTableColumn<Payment>[] = [
  { id: "description", header: "Description", cell: (row) => row.description, target: true },
  { id: "account", header: "Account", cell: (row) => row.account, hideBelow: 840 },
  { id: "amount", header: "Amount", cell: (row) => row.amount, align: "end" },
];

async function renderInRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/transactions"] }),
  });
  render(<RouterProvider router={router} />);
  await router.load();
  return router;
}

describe("DataTable", () => {
  it("renders headers and cells with table semantics", () => {
    render(
      <DataTable label="Payments" columns={columns} rows={payments} getRowKey={(row) => row.id} />
    );

    const table = screen.getByRole("table", { name: "Payments" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Description",
      "Account",
      "Amount",
    ]);

    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(
      within(rows[1]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["Groceries", "Cash", "₱250.00"]);
  });

  it("hides a hideBelow column, header and cells, below its container width", () => {
    render(
      <DataTable label="Payments" columns={columns} rows={payments} getRowKey={(row) => row.id} />
    );

    const responsive = "@[840px]:table-cell";
    expect(screen.getByRole("columnheader", { name: "Account" })).toHaveClass("hidden", responsive);
    expect(screen.getByRole("cell", { name: "Cash" })).toHaveClass("hidden", responsive);
    expect(screen.getByRole("columnheader", { name: "Description" })).not.toHaveClass("hidden");
  });

  it("measures hideBelow against its own container, wherever it is placed", () => {
    render(
      <DataTable label="Payments" columns={columns} rows={payments} getRowKey={(row) => row.id} />
    );

    expect(screen.getByRole("table", { name: "Payments" }).closest(".\\@container")).not.toBeNull();
  });

  it("gives each row one button target, in its target column and named by it", () => {
    const onOpen = vi.fn();
    render(
      <DataTable
        label="Payments"
        columns={columns}
        rows={payments}
        getRowKey={(row) => row.id}
        rowTarget={(row) => ({ onClick: () => onOpen(row.id) })}
      />
    );

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Groceries" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rent" }));
    expect(onOpen).toHaveBeenCalledWith("p2");
  });

  it("renders link targets and marks the open row with aria-current=true", async () => {
    await renderInRouter(
      <DataTable
        label="Payments"
        columns={columns}
        rows={payments}
        getRowKey={(row) => row.id}
        rowTarget={(row) => ({ link: { to: "/transactions", search: { account: row.id } } })}
        isRowOpen={(row) => row.id === "p1"}
      />
    );

    const open = await screen.findByRole("link", { name: "Groceries" });
    expect(open).toHaveAttribute("href", "/transactions?account=p1");
    expect(open).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Rent" })).not.toHaveAttribute("aria-current");
  });

  it("keeps a quick action in a cell from triggering the row", () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    const withActions: DataTableColumn<Payment>[] = [
      ...columns,
      {
        id: "actions",
        header: <span className="sr-only">Actions</span>,
        cell: (row) => (
          <button type="button" onClick={() => onRemove(row.id)}>
            Remove {row.description}
          </button>
        ),
        actions: true,
      },
    ];
    render(
      <DataTable
        label="Payments"
        columns={withActions}
        rows={payments}
        getRowKey={(row) => row.id}
        rowTarget={() => ({ onClick: onOpen })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Groceries" }));
    expect(onRemove).toHaveBeenCalledWith("p1");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
