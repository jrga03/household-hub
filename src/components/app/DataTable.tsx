import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RowActions, RowTargetElement, type RowTarget } from "./ListRow";

/** Container widths, in px, a column can hide below. */
type ContainerWidth = 480 | 600 | 900 | 1100;

const hiddenBelow: Record<ContainerWidth, string> = {
  480: "hidden @[480px]:table-cell",
  600: "hidden @[600px]:table-cell",
  900: "hidden @[900px]:table-cell",
  1100: "hidden @[1100px]:table-cell",
};

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Amounts align to the end. */
  align?: "start" | "end";
  /** Hide the column when the table's own container is narrower than this. */
  hideBelow?: ContainerWidth;
  /** This column's cell holds the row's target and names it. Defaults to the first column. */
  target?: boolean;
  /** The cell holds quick actions, shown on hover or focus above the row's target. */
  actions?: boolean;
}

interface DataTableProps<Row> {
  /** The table's accessible name. */
  label: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  rowTarget?: (row: Row) => RowTarget;
  isRowOpen?: (row: Row) => boolean;
  className?: string;
}

export function DataTable<Row>({
  label,
  columns,
  rows,
  getRowKey,
  rowTarget,
  isRowOpen,
  className,
}: DataTableProps<Row>) {
  const targetColumnId = (columns.find((column) => column.target) ?? columns[0])?.id;

  return (
    <div className="@container">
      <Table aria-label={label} className={className}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={cn(
                  "text-label text-muted-foreground",
                  column.align === "end" && "text-right",
                  column.hideBelow && hiddenBelow[column.hideBelow]
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const target = rowTarget?.(row);
            const open = isRowOpen?.(row) ?? false;
            return (
              <TableRow
                key={getRowKey(row)}
                className={cn(
                  "group/row relative",
                  target && "hover:bg-accent",
                  open && "bg-accent hover:bg-accent"
                )}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      column.align === "end" && "text-right tabular-nums",
                      column.hideBelow && hiddenBelow[column.hideBelow]
                    )}
                  >
                    <CellContent
                      content={column.cell(row)}
                      target={column.id === targetColumnId ? target : undefined}
                      open={open}
                      actions={column.actions ?? false}
                    />
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CellContent({
  content,
  target,
  open,
  actions,
}: {
  content: ReactNode;
  target: RowTarget | undefined;
  open: boolean;
  actions: boolean;
}) {
  if (actions) {
    return <RowActions className="justify-end">{content}</RowActions>;
  }
  if (target) {
    return (
      <RowTargetElement {...target} open={open} className="block w-full truncate text-left">
        {content}
      </RowTargetElement>
    );
  }
  return content;
}
