/**
 * ExportButton Component
 *
 * Simple button component for triggering CSV export of transactions.
 * Generates timestamped filename and triggers browser download.
 *
 * Part of chunk 036-csv-export (manual backup functionality).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { csvExporter } from "@/lib/csv-exporter";
import { toast } from "sonner";

export function ExportButton() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Export all transactions (no filters)
      const csv = await csvExporter.exportTransactions();

      // Generate timestamped filename
      const date = new Date().toISOString().split("T")[0];
      const filename = `household-hub-transactions-${date}.csv`;

      // Trigger browser download
      csvExporter.downloadCsv(csv, filename);

      // Success feedback
      toast.success("Transactions exported successfully");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button onClick={handleExport} variant="outline" disabled={isExporting}>
      {isExporting ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Download className="w-4 h-4 mr-2" />
      )}
      {isExporting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
