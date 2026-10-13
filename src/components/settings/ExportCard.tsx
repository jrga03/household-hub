import { useState } from "react";
import { toast } from "sonner";
import { FileJson, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readEventLogExport } from "@/lib/export/event-log";
import { readTransactionsCsv } from "@/lib/export/transactions-csv";
import { reportError } from "@/lib/sentry";
import { errorMessage } from "@/lib/utils";
import { downloadCsv, downloadJson } from "@/lib/utils/download";
import { todayLocalDate } from "@/lib/utils/dates";

async function exportTransactions() {
  downloadCsv(`household-hub-transactions-${todayLocalDate()}.csv`, await readTransactionsCsv());
}

async function exportEventLog() {
  downloadJson(
    `household-hub-event-log-${todayLocalDate()}.json`,
    await readEventLogExport(new Date())
  );
}

/** Both downloads are built on this device, from what it holds; they work offline. */
export function ExportCard() {
  const [exporting, setExporting] = useState(false);

  const run = async (download: () => Promise<void>, operation: string) => {
    setExporting(true);
    try {
      await download();
    } catch (caught) {
      reportError(caught, { subsystem: "export", operation });
      toast.error(errorMessage(caught, "Couldn't build the export."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card id="export" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>
          Download what this device holds: Household records plus your own Personal ones.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 @[600px]:flex-row">
        <Button
          variant="outline"
          disabled={exporting}
          onClick={() => void run(exportTransactions, "transactions-csv")}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Transactions (CSV)
        </Button>
        <Button
          variant="outline"
          disabled={exporting}
          onClick={() => void run(exportEventLog, "event-log-json")}
        >
          <FileJson className="h-4 w-4" />
          Event log (JSON)
        </Button>
      </CardContent>
    </Card>
  );
}
