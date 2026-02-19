/**
 * Preview Step - Table showing parsed transactions with inline editing
 */

import { AlertTriangle, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { ParsedTransactionRow } from "@/types/pdf-import";

export function PreviewStep() {
  const { parsedRows, failedRows, warnings, userEdits, setUserEdit, setStep } = usePDFImportStore();

  const getEffectiveRow = (index: number): ParsedTransactionRow => {
    const base = parsedRows[index];
    const edits = userEdits.get(index);
    if (!edits) return base;
    return { ...base, ...edits };
  };

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
            {parsedRows.length} transaction{parsedRows.length !== 1 ? "s" : ""} found. Click any
            cell to edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {parsedRows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No transactions were parsed from this PDF.
            </p>
          ) : (
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
                    const isLowConfidence = row.confidence < 0.7;

                    return (
                      <TableRow
                        key={index}
                        className={isLowConfidence ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                      >
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-28"
                            aria-label={`Date for row ${index + 1}`}
                            value={row.date}
                            onChange={(e) => setUserEdit(index, { date: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            aria-label={`Description for row ${index + 1}`}
                            value={row.description}
                            onChange={(e) => setUserEdit(index, { description: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="h-8 w-28 text-right"
                            aria-label={`Amount for row ${index + 1}`}
                            value={row.amount}
                            onChange={(e) => setUserEdit(index, { amount: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.type === "expense" ? "destructive" : "default"}>
                            {row.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.confidence >= 0.9 ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {Math.round(row.confidence * 100)}%
                            </span>
                          )}
                        </TableCell>
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
