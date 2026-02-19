/**
 * PDF Import Route - /import/pdf
 *
 * Lazy-loads the PDFImportPage component to keep pdfjs-dist out of the main bundle.
 * The entire PDF import feature (including pdfjs-dist ~400KB) only loads when
 * the user navigates to this route.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const PDFImportPage = lazy(() =>
  import("@/components/pdf-import/PDFImportPage").then((m) => ({
    default: m.PDFImportPage,
  }))
);

export const Route = createFileRoute("/import/pdf")({
  component: PDFImportRoute,
});

function PDFImportRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PDFImportPage />
    </Suspense>
  );
}
