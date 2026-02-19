/**
 * Duplicate Detection Step - Shows which rows are duplicates with toggle controls
 */

import { AlertTriangle, Check, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePDFImportStore } from "@/stores/pdfImportStore";

export function DuplicateStep() {
  const { parsedRows, duplicateIndices, setDuplicateIndices, setStep } = usePDFImportStore();

  const uniqueCount = parsedRows.length - duplicateIndices.size;
  const duplicateCount = duplicateIndices.size;

  const toggleInclude = (index: number) => {
    const next = new Set(duplicateIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setDuplicateIndices(next);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{uniqueCount}</p>
                <p className="text-sm text-muted-foreground">Unique transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{duplicateCount}</p>
                <p className="text-sm text-muted-foreground">Duplicates (excluded)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate list */}
      {duplicateCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Duplicate Transactions
            </CardTitle>
            <CardDescription>
              These transactions already exist. Uncheck to include them anyway.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Exclude</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows
                    .map((row, index) => ({ row, index }))
                    .filter(({ index }) => duplicateIndices.has(index))
                    .map(({ row, index }) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Checkbox
                            checked={duplicateIndices.has(index)}
                            onCheckedChange={() => toggleInclude(index)}
                          />
                        </TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell className="truncate">{row.description}</TableCell>
                        <TableCell className="text-right">{row.amount}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep("account")}>
          Back
        </Button>
        <Button className="flex-1" onClick={() => setStep("confirming")}>
          Import {uniqueCount} Transaction{uniqueCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}
