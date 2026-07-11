/**
 * Preview Step - Parsed transactions with inline editing.
 *
 * Two presentations of the same rows (mobile UX review R24):
 * - sm and up: a table with one input per cell
 * - below sm: card-stacked label + input pairs per row (every column here is
 *   editable, so columns can't simply be hidden at phone width)
 * Exactly ONE presentation is mounted at a time (useMediaQuery, not CSS
 * hiding): statements can parse to hundreds of rows and there is no
 * virtualizer here, so mounting both would double the DOM and re-render cost.
 * Both presentations render from the same field descriptors
 * (`getEditableFields`) and write through the same store path, so editing
 * behavior is identical, not forked.
 */

import { AlertTriangle, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePDFImportStore } from "@/stores/pdfImportStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { ParsedTransactionRow } from "@/types/pdf-import";

interface EditableFieldDescriptor {
  key: "date" | "description" | "amount";
  label: string;
  value: string;
  /** Sizing for the compact table presentation only. */
  tableInputClassName: string;
  onChange: (value: string) => void;
}

export function PreviewStep() {
  const { parsedRows, failedRows, warnings, userEdits, setUserEdit, setStep } = usePDFImportStore();
  // Tailwind `sm` breakpoint. The import wizard dialog is near-fullscreen on
  // phones, so the viewport is a faithful proxy for the available width here.
  const isTableWidth = useMediaQuery("(min-width: 640px)");

  const getEffectiveRow = (index: number): ParsedTransactionRow => {
    const base = parsedRows[index];
    const edits = userEdits.get(index);
    if (!edits) return base;
    return { ...base, ...edits };
  };

  /**
   * Single source of truth for row editing: the table (sm+) and the card
   * list (below sm) both render their inputs from these descriptors.
   */
  const getEditableFields = (
    index: number,
    row: ParsedTransactionRow
  ): EditableFieldDescriptor[] => [
    {
      key: "date",
      label: "Date",
      value: row.date,
      tableInputClassName: "h-8 w-28",
      onChange: (value) => setUserEdit(index, { date: value }),
    },
    {
      key: "description",
      label: "Description",
      value: row.description,
      tableInputClassName: "h-8",
      onChange: (value) => setUserEdit(index, { description: value }),
    },
    {
      key: "amount",
      label: "Amount",
      value: row.amount,
      tableInputClassName: "h-8 w-28 text-right",
      onChange: (value) => setUserEdit(index, { amount: value }),
    },
  ];

  const renderConfidence = (row: ParsedTransactionRow) =>
    row.confidence >= 0.9 ? (
      <Check className="h-4 w-4 text-green-600" />
    ) : (
      <span className="text-sm text-muted-foreground">{Math.round(row.confidence * 100)}%</span>
    );

  return (
    <div className="space-y-4">
      {/* Warnings */}
      {warnings.map((warning, i) => (
        <Alert key={i} variant="default">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      {/* Parsed rows table */}
      <Card>
        <CardHeader>
          <CardTitle>Parsed Transactions</CardTitle>
          <CardDescription>
            {parsedRows.length} transaction{parsedRows.length !== 1 ? "s" : ""} found. Tap any field
            to edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {parsedRows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No transactions were parsed from this PDF.
            </p>
          ) : !isTableWidth ? (
            /* Card-stacked presentation (below sm): label + input pairs per row */
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {parsedRows.map((_, index) => {
                const row = getEffectiveRow(index);
                const fields = getEditableFields(index, row);
                const isLowConfidence = row.confidence < 0.7;

                return (
                  <div
                    key={index}
                    className={`space-y-2 rounded-md border p-3 ${
                      isLowConfidence ? "bg-yellow-50 dark:bg-yellow-950/20" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Row {index + 1}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={row.type === "expense" ? "destructive" : "default"}>
                          {row.type}
                        </Badge>
                        {renderConfidence(row)}
                      </div>
                    </div>
                    {fields.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label
                          htmlFor={`preview-row-${index}-${field.key}`}
                          className="text-xs text-muted-foreground"
                        >
                          {field.label}
                        </Label>
                        <Input
                          id={`preview-row-${index}-${field.key}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table presentation (sm and up) */
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-20">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((_, index) => {
                    const row = getEffectiveRow(index);
                    const fields = getEditableFields(index, row);
                    const isLowConfidence = row.confidence < 0.7;

                    return (
                      <TableRow
                        key={index}
                        className={isLowConfidence ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                      >
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        {fields.map((field) => (
                          <TableCell
                            key={field.key}
                            className={field.key === "amount" ? "text-right" : undefined}
                          >
                            <Input
                              className={field.tableInputClassName}
                              aria-label={`${field.label} for row ${index + 1}`}
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </TableCell>
                        ))}
                        <TableCell>
                          <Badge variant={row.type === "expense" ? "destructive" : "default"}>
                            {row.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{renderConfidence(row)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failed rows */}
      {failedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Failed Rows ({failedRows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 space-y-2 overflow-auto">
              {failedRows.map((row, i) => (
                <div key={i} className="rounded border p-2 text-sm">
                  <span className="font-mono text-muted-foreground">Line {row.lineNumber}:</span>{" "}
                  {row.reason}
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {row.rawText}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep("bank")}>
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={parsedRows.length === 0}
          onClick={() => setStep("account")}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
