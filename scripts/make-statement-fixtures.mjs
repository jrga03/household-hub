/**
 * Writes the synthetic statement fixtures the parser tests read:
 * tests/fixtures/statements/bdo-credit-card.pdf, a BDO-layout statement with
 * made-up lines, encrypted with FIXTURE_PASSWORD, and not-a-statement.pdf.
 * Needs qpdf (`brew install qpdf`). Run: node scripts/make-statement-fixtures.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT_DIR = "tests/fixtures/statements";
const FIXTURE_PASSWORD = "fixture-password";

// Column x positions and row spacing measured from a real BDO statement.
const SALE_X = 33;
const POST_X = 88;
const DETAILS_X = 143;
const AMOUNT_RIGHT = 463;
const ROW = 13;

const escapeText = (text) => text.replace(/[\\()]/g, (char) => `\\${char}`);

// Helvetica at 7pt averages about 3.9pt per character: close enough to right-align amounts.
const textAt = (x, y, text) => `BT /F1 7 Tf ${x} ${y} Td (${escapeText(text)}) Tj ET`;
const amountAt = (y, amount) => textAt(AMOUNT_RIGHT - amount.length * 3.9, y, amount);

function statementPage(rows, pageNumber, pageCount) {
  const ops = [
    textAt(19, 710, "MS JUANA DELA CRUZ"),
    textAt(286, 760, "Credit Cards"),
    textAt(286, 745, "Statement of Account"),
    textAt(284, 716, "VISA GOLD (PHP)"),
    textAt(284, 704, "Statement Date"),
    textAt(428, 704, "Aug 16, 2026"),
    textAt(SALE_X, 453, "Sale Date"),
    textAt(POST_X, 453, "Post Date"),
    textAt(DETAILS_X, 453, "Transaction Details"),
    textAt(430, 453, "Amount"),
  ];
  let y = 435;
  for (const row of rows) {
    if (row.sale) ops.push(textAt(SALE_X, y, row.sale), textAt(POST_X, y, row.post));
    ops.push(textAt(DETAILS_X, y, row.details));
    if (row.amount) ops.push(amountAt(y, row.amount));
    y -= ROW;
  }
  ops.push(textAt(432, 20, `Page ${pageNumber} of ${pageCount}`));
  return ops.join("\n");
}

const BDO_PAGES = [
  [
    { details: "PREVIOUS STATEMENT BALANCE", amount: "12,345.67" },
    { details: "CARD NUMBER 4000-0000-0000-0001" },
    { sale: "07/28/26", post: "07/29/26", details: "SARI SARI STORE QUEZON PH", amount: "150.00" },
    { sale: "07/28/26", post: "07/29/26", details: "SARI SARI STORE QUEZON PH", amount: "150.00" },
    {
      sale: "08/02/26",
      post: "08/02/26",
      details: "PAYMENT RECEIVED - THANK YOU",
      amount: "-12,345.67",
    },
    {
      sale: "08/03/26",
      post: "08/05/26",
      details: "ONLINE SHOP (PH) MAKATI PH",
      amount: "1,999.50",
    },
    { details: "Reference: 000123" },
    {
      sale: "08/04/26",
      post: "08/05/26",
      details: "ONLINE SHOP (PH) MAKATI PH",
      amount: "-499.50",
    },
    { details: "SUBTOTAL", amount: "1,650.00" },
  ],
  [
    { details: "CARD NUMBER 4000-0000-0000-0002" },
    { sale: "12/30/25", post: "01/02/26", details: "STREAMING SVC SG SG", amount: "549.00" },
    {
      sale: "08/16/26",
      post: "08/16/26",
      details: "FINANCE CHARGE-RETAIL PURCHASES",
      amount: "12.34",
    },
    { details: "SUBTOTAL", amount: "561.34" },
    { details: "TOTAL", amount: "2,211.34" },
  ],
];

/** A minimal PDF: one Helvetica font, one content stream per page. */
function buildPdf(pageContents) {
  const objects = [];
  const pageCount = pageContents.length;
  const pageIds = pageContents.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pageContents.forEach((content, index) => {
    const pageId = pageIds[index];
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 495 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] =
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.7\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function encrypt(source, target, password) {
  execFileSync("qpdf", ["--encrypt", password, `${password}-owner`, "256", "--", source, target]);
}

mkdirSync(OUT_DIR, { recursive: true });
const workDir = mkdtempSync(join(tmpdir(), "statement-fixtures-"));
try {
  const plainBdo = join(workDir, "bdo.pdf");
  writeFileSync(
    plainBdo,
    buildPdf(BDO_PAGES.map((rows, index) => statementPage(rows, index + 1, BDO_PAGES.length)))
  );
  encrypt(plainBdo, join(OUT_DIR, "bdo-credit-card.pdf"), FIXTURE_PASSWORD);

  writeFileSync(
    join(OUT_DIR, "not-a-statement.pdf"),
    buildPdf([textAt(72, 700, "Meeting notes, nothing to import here.")])
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
console.log(`Wrote fixtures to ${OUT_DIR} (password: ${FIXTURE_PASSWORD})`);
