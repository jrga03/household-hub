function downloadText(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves `data` as a JSON file through the browser's download. */
export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

/** The byte-order mark tells Excel the file is UTF-8, so ₱ and ñ survive. */
export function downloadCsv(filename: string, csv: string): void {
  downloadText(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}
