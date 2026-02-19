/**
 * PDF Import Page - Multi-step wizard orchestrator
 *
 * Manages the flow between wizard steps and wires up the PDF worker,
 * parser, duplicate detection, and draft creation.
 *
 * Steps: upload → bank → extracting → preview → account → duplicates → confirming → complete
 */

import { useEffect, useCallback } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePDFImportStore } from "@/stores/pdfImportStore";
import { usePDFWorker } from "@/lib/pdf-worker/usePDFWorker";
import { getParser, detectParser } from "@/lib/pdf-parsers";
import { detectPDFDuplicates } from "@/lib/pdf-import-duplicates";
import { createImportSession } from "@/lib/import-drafts";
import { PDFUploadStep } from "./steps/PDFUploadStep";
import { BankSelectStep } from "./steps/BankSelectStep";
import { ExtractionProgress } from "./steps/ExtractionProgress";
import { PreviewStep } from "./steps/PreviewStep";
import { AccountMapStep } from "./steps/AccountMapStep";
import { DuplicateStep } from "./steps/DuplicateStep";
import { CompleteStep } from "./steps/CompleteStep";

export function PDFImportPage() {
  const store = usePDFImportStore();
  const {
    status: workerStatus,
    pages: workerPages,
    progress: workerProgress,
    error: workerError,
    extract,
    cancel,
  } = usePDFWorker();

  // Start extraction when entering the "extracting" step
  useEffect(() => {
    if (store.step === "extracting") {
      const { file, password } = usePDFImportStore.getState();
      if (file) {
        extract(file, password || undefined);
      }
    }
  }, [store.step, extract]);

  // Handle worker completion → run parser
  useEffect(() => {
    if (workerStatus === "complete") {
      const s = usePDFImportStore.getState();
      if (s.step !== "extracting") return;

      s.setExtractedPages(workerPages);

      // Try auto-detect bank if not already selected
      let bankId = s.selectedBankId;
      if (!bankId && workerPages.length > 0) {
        const firstPageText = workerPages[0].items.map((item) => item.text).join(" ");
        const detected = detectParser(firstPageText);
        if (detected) {
          s.setSelectedBankId(detected.id);
          bankId = detected.id;
        }
      }

      // Run parser
      const parser = bankId ? getParser(bankId) : null;
      if (parser) {
        const result = parser.parse(workerPages);
        s.setParsedRows(result.transactions);
        s.setFailedRows(result.failedRows);
        s.setWarnings(result.warnings);
      }

      s.setStep("preview");
    }
  }, [workerStatus, workerPages]);

  // Handle worker errors
  useEffect(() => {
    if (workerStatus === "error" && workerError) {
      if (workerError.code === "WRONG_PASSWORD") {
        const s = usePDFImportStore.getState();
        s.setNeedsPassword(true);
        s.setStep("upload");
      }
    }
  }, [workerStatus, workerError]);

  // Handle duplicate detection when entering "duplicates" step
  useEffect(() => {
    if (store.step === "duplicates") {
      const { parsedRows, selectedAccountId, setDuplicateIndices } = usePDFImportStore.getState();
      if (selectedAccountId) {
        detectPDFDuplicates(parsedRows, selectedAccountId)
          .then((indices) => setDuplicateIndices(indices))
          .catch(() => setDuplicateIndices(new Set()));
      }
    }
  }, [store.step]);

  // Handle draft creation when entering "confirming" step
  const handleConfirm = useCallback(async () => {
    const s = usePDFImportStore.getState();
    if (!s.file || !s.selectedBankId || !s.selectedAccountId) return;

    // Filter out duplicates and apply user edits
    const rowsToImport = s.parsedRows
      .map((row, index) => {
        if (s.duplicateIndices.has(index)) return null;
        const edits = s.userEdits.get(index);
        return edits ? { ...row, ...edits } : row;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    try {
      const { drafts } = await createImportSession(
        s.file.name,
        s.selectedBankId,
        rowsToImport,
        s.selectedAccountId
      );

      s.setResultCounts({
        created: drafts.length,
        duplicates: s.duplicateIndices.size,
        failed: s.failedRows.length,
      });
      s.setStep("complete");
    } catch {
      toast.error("Failed to create import session. Please try again.");
      s.setStep("duplicates");
    }
  }, []);

  useEffect(() => {
    if (store.step === "confirming") {
      handleConfirm();
    }
  }, [store.step, handleConfirm]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileText className="h-6 w-6" />
          PDF Statement Import
        </h1>
        <p className="text-muted-foreground">Import transactions from a bank statement PDF.</p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={store.step} />

      {/* Worker error display */}
      {workerStatus === "error" && workerError && workerError.code !== "WRONG_PASSWORD" && (
        <Alert variant="destructive">
          <AlertDescription>{workerError.message}</AlertDescription>
        </Alert>
      )}

      {/* Active step */}
      {store.step === "upload" && <PDFUploadStep />}
      {store.step === "bank" && <BankSelectStep />}
      {store.step === "extracting" && (
        <ExtractionProgress
          progress={workerProgress}
          onCancel={() => {
            cancel();
            store.setStep("bank");
          }}
        />
      )}
      {store.step === "preview" && <PreviewStep />}
      {store.step === "account" && <AccountMapStep />}
      {store.step === "duplicates" && <DuplicateStep />}
      {store.step === "confirming" && <ExtractionProgress progress={null} onCancel={() => {}} />}
      {store.step === "complete" && <CompleteStep />}
    </div>
  );
}

const STEPS: { key: string; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "bank", label: "Bank" },
  { key: "extracting", label: "Extract" },
  { key: "preview", label: "Preview" },
  { key: "account", label: "Account" },
  { key: "duplicates", label: "Duplicates" },
  { key: "confirming", label: "Confirm" },
  { key: "complete", label: "Done" },
];

function StepIndicator({ current }: { current: string }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((step, idx) => (
        <div key={step.key} className="flex items-center">
          <div
            className={`rounded-full px-2 py-1 text-xs font-medium ${
              idx === currentIdx
                ? "bg-primary text-primary-foreground"
                : idx < currentIdx
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step.label}
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`mx-1 h-0.5 w-4 ${idx < currentIdx ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}
