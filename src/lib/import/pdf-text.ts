// The legacy build: the modern one needs Math.sumPrecise, which Safari before 26 lacks.
import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
  VerbosityLevel,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { StatementParseError } from "./statement";

// pdf.js runs its worker code in this thread when it finds it on globalThis.
// Parsing already happens in our own Web Worker, so a nested one adds nothing,
// and bundling it here keeps it a precached .js chunk.
Object.assign(globalThis, { pdfjsWorker });

/** A line of text: the strings that share a baseline, left to right. */
export type PdfLine = string[];

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

function toLines(items: PositionedText[]): PdfLine[] {
  const rows = new Map<number, PositionedText[]>();
  for (const item of items) {
    const row = rows.get(item.y) ?? [];
    row.push(item);
    rows.set(item.y, row);
  }
  return [...rows.entries()]
    .sort(([top], [bottom]) => bottom - top)
    .map(([, row]) => row.sort((left, right) => left.x - right.x).map((item) => item.text));
}

function toParseError(error: unknown): StatementParseError {
  if (error instanceof PasswordException) {
    return new StatementParseError(
      error.code === PasswordResponses.INCORRECT_PASSWORD ? "wrong-password" : "password-required"
    );
  }
  if (error instanceof InvalidPDFException) return new StatementParseError("unrecognised-layout");
  return new StatementParseError("failed", { cause: error });
}

/** Every line of text in the PDF, page by page, top to bottom. */
export async function readPdfLines(data: ArrayBuffer, password: string): Promise<PdfLine[]> {
  const loadingTask = getDocument({
    // pdf.js takes ownership of the buffer it's given; a copy leaves the caller's intact.
    data: new Uint8Array(data.slice(0)),
    password,
    disableFontFace: true,
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    const document = await loadingTask.promise;
    const lines: PdfLine[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) =>
        "str" in item && item.str.trim() !== ""
          ? [{ text: item.str.trim(), x: item.transform[4], y: Math.round(item.transform[5]) }]
          : []
      );
      lines.push(...toLines(items));
    }
    return lines;
  } catch (error) {
    throw toParseError(error);
  } finally {
    await loadingTask.destroy();
  }
}
