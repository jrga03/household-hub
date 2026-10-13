// pdf.js ships no types for its worker entry; only its presence on globalThis matters.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
