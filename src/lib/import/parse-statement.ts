import { reportError } from "@/lib/sentry";
import {
  StatementParseError,
  type StatementFormatId,
  type StatementLine,
  type StatementParseProblem,
} from "./statement";

export interface ParseRequest {
  formatId: StatementFormatId;
  data: ArrayBuffer;
  password: string;
  reply: MessagePort;
}

export type ParseResponse =
  | { ok: true; lines: StatementLine[] }
  | { ok: false; problem: StatementParseProblem; detail?: string };

/**
 * Reads a statement in a Web Worker, so pdf.js never blocks the page. The
 * worker and its parsers are a separate chunk, fetched on the first parse
 * (and precached for offline use).
 */
export async function parseStatement(
  formatId: StatementFormatId,
  file: Blob,
  password: string
): Promise<StatementLine[]> {
  const data = await file.arrayBuffer();
  const worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });
  try {
    const response = await new Promise<ParseResponse>((resolve, reject) => {
      // A channel of our own: pdf.js's worker code also talks on the worker's
      // global port (its "ready" handshake), and must not be read as the answer.
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent<ParseResponse>) => resolve(event.data);
      worker.onerror = (event) => reject(new Error(event.message || "The import worker failed."));
      const request: ParseRequest = { formatId, data, password, reply: channel.port2 };
      worker.postMessage(request, [data, channel.port2]);
    });
    if (response.ok) return response.lines;
    if (response.problem === "failed") {
      reportError(new Error(response.detail ?? "Statement parsing failed"), {
        subsystem: "import",
        operation: formatId,
      });
    }
    throw new StatementParseError(response.problem);
  } catch (error) {
    if (error instanceof StatementParseError) throw error;
    reportError(error, { subsystem: "import", operation: formatId });
    throw new StatementParseError("failed", { cause: error });
  } finally {
    worker.terminate();
  }
}
