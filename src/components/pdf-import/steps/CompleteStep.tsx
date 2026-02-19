/**
 * Complete Step - Summary of import results with navigation options
 */

import { Link } from "@tanstack/react-router";
import { CheckCircle2, FileText, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePDFImportStore } from "@/stores/pdfImportStore";

export function CompleteStep() {
  const { resultCounts, reset } = usePDFImportStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          Import Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Result counts */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-600">{resultCounts.created}</p>
            <p className="text-sm text-muted-foreground">Drafts Created</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{resultCounts.duplicates}</p>
            <p className="text-sm text-muted-foreground">Duplicates Skipped</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-destructive">{resultCounts.failed}</p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </div>
        </div>

        {resultCounts.created > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Drafts are ready for review. Confirm them to create real transactions.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {resultCounts.created > 0 && (
            <Button asChild>
              <Link to="/drafts">
                <FileText className="mr-2 h-4 w-4" />
                Review Drafts
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={reset}>
            Import Another PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
