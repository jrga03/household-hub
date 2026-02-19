/**
 * React hook for managing the PDF extraction Web Worker lifecycle.
 *
 * Creates the worker lazily on first extract() call, handles message routing,
 * and cleans up on unmount.
 *
 * @module pdf-worker/usePDFWorker
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PDFPageData,
  WorkerInboundMessage,
  WorkerOutboundMessage,
  WorkerErrorCode,
} from "@/types/pdf-import";

export type PDFWorkerStatus = "idle" | "extracting" | "complete" | "error";

interface PDFWorkerState {
  status: PDFWorkerStatus;
  progress: { current: number; total: number } | null;
  pages: PDFPageData[];
  error: { code: WorkerErrorCode; message: string } | null;
}

export function usePDFWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<PDFWorkerState>({
    status: "idle",
    progress: null,
    pages: [],
    error: null,
  });

  // Create worker lazily
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
        type: "module",
      });

      workerRef.current.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
        const message = event.data;

        switch (message.type) {
          case "PROGRESS":
            setState((prev) => ({
              ...prev,
              progress: message.payload,
            }));
            break;

          case "PAGE_DONE":
            setState((prev) => ({
              ...prev,
              pages: [...prev.pages, message.payload.data],
            }));
            break;

          case "EXTRACTION_COMPLETE":
            setState((prev) => ({
              ...prev,
              status: "complete",
              pages: message.payload.pages,
            }));
            break;

          case "ERROR":
            setState((prev) => ({
              ...prev,
              status: "error",
              error: message.payload,
            }));
            break;
        }
      };

      workerRef.current.onerror = (event) => {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: {
            code: "EXTRACTION_FAILED" as WorkerErrorCode,
            message: event.message || "Worker error",
          },
        }));
      };
    }
    return workerRef.current;
  }, []);

  const extract = useCallback(
    (file: File, password?: string) => {
      setState({
        status: "extracting",
        progress: null,
        pages: [],
        error: null,
      });

      const worker = getWorker();

      file
        .arrayBuffer()
        .then((buffer) => {
          const message: WorkerInboundMessage = {
            type: "EXTRACT",
            payload: { buffer, password },
          };
          worker.postMessage(message, [buffer]);
        })
        .catch(() => {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: { code: "EXTRACTION_FAILED" as WorkerErrorCode, message: "Failed to read file" },
          }));
        });
    },
    [getWorker]
  );

  const cancel = useCallback(() => {
    if (workerRef.current) {
      const message: WorkerInboundMessage = { type: "CANCEL" };
      workerRef.current.postMessage(message);
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      progress: null,
      pages: [],
      error: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    extract,
    cancel,
    reset,
  };
}
