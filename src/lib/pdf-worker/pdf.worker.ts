/**
 * PDF Text Extraction Web Worker
 *
 * Runs pdfjs-dist in a dedicated worker thread to avoid blocking the main thread.
 * Extracts text items with position data (x, y, width, height) per page.
 *
 * Message Protocol:
 * - Inbound: EXTRACT (with ArrayBuffer + optional password), CANCEL
 * - Outbound: PROGRESS, PAGE_DONE, EXTRACTION_COMPLETE, ERROR
 *
 * @module pdf-worker/pdf.worker
 */

import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  PDFPageData,
  PDFTextItem,
} from "@/types/pdf-import";

// Disable nested worker — we ARE the worker thread already.
// pdfjs-dist normally spawns its own worker, but since we're already in a worker,
// setting workerSrc to empty string tells it to run inline.
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

let cancelled = false;

function send(message: WorkerOutboundMessage) {
  self.postMessage(message);
}

async function extractPDF(buffer: ArrayBuffer, password?: string) {
  cancelled = false;

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      password: password || undefined,
    });

    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    if (totalPages === 0) {
      send({ type: "ERROR", payload: { code: "EMPTY_PDF", message: "PDF has no pages" } });
      return;
    }

    const pages: PDFPageData[] = [];

    for (let i = 1; i <= totalPages; i++) {
      if (cancelled) {
        send({ type: "ERROR", payload: { code: "CANCELLED", message: "Extraction cancelled" } });
        return;
      }

      send({ type: "PROGRESS", payload: { current: i, total: totalPages } });

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      const items: PDFTextItem[] = textContent.items
        .filter((item): item is TextItem => "str" in item && "transform" in item)
        .map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
          fontName: item.fontName,
        }));

      const pageData: PDFPageData = {
        pageNumber: i,
        items,
        width: viewport.width,
        height: viewport.height,
      };

      pages.push(pageData);
      send({ type: "PAGE_DONE", payload: { pageNumber: i, data: pageData } });
    }

    send({
      type: "EXTRACTION_COMPLETE",
      payload: { pages, totalPages },
    });
  } catch (error: unknown) {
    const err = error as Error & { name?: string };

    if (err.name === "PasswordException" || err.message?.includes("password")) {
      send({
        type: "ERROR",
        payload: { code: "WRONG_PASSWORD", message: "Incorrect or missing password" },
      });
    } else if (err.name === "InvalidPDFException") {
      send({
        type: "ERROR",
        payload: { code: "CORRUPT_PDF", message: "Invalid or corrupted PDF file" },
      });
    } else {
      send({
        type: "ERROR",
        payload: {
          code: "EXTRACTION_FAILED",
          message: err.message || "PDF extraction failed",
        },
      });
    }
  }
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "EXTRACT":
      extractPDF(message.payload.buffer, message.payload.password);
      break;
    case "CANCEL":
      cancelled = true;
      break;
  }
};
