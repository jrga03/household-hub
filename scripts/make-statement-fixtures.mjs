/**
 * Writes the synthetic statement fixtures the parser tests read, each with
 * made-up lines and encrypted with FIXTURE_PASSWORD:
 * tests/fixtures/statements/bdo-credit-card.pdf (BDO layout) and
 * unionbank-credit-card.xlsx (UnionBank layout, Office agile encryption), plus
 * not-a-statement.pdf and not-a-statement.xlsx.
 * Needs qpdf (`brew install qpdf`) and uv (for msoffcrypto-tool).
 * Run: node scripts/make-statement-fixtures.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

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

const escapeXml = (text) =>
  text.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]
  );

/** A minimal zip: entries deflated unless named in `stored`, no extra fields. */
function buildZip(entries, stored = []) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const method = stored.includes(name) ? 0 : 8;
    const deflated = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, deflated);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + deflated.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const columnName = (index) => String.fromCharCode(65 + index);

/**
 * A one-sheet workbook. Strings in shared strings, except where a cell is
 * { inline: "text" } (exporters like UnionBank's write inline strings).
 */
function buildXlsx(sheetName, rows) {
  const shared = [];
  const sharedIndex = (text) => {
    if (!shared.includes(text)) shared.push(text);
    return shared.indexOf(text);
  };
  const cellXml = (value, ref) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
    if (typeof value === "object") {
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value.inline)}</t></is></c>`;
    }
    return `<c r="${ref}" t="s"><v>${sharedIndex(value)}</v></c>`;
  };
  const rowsXml = rows
    .map(([rowNumber, cells]) => {
      const cellsXml = cells.map((value, index) =>
        cellXml(value, `${columnName(index)}${rowNumber}`)
      );
      return `<row r="${rowNumber}">${cellsXml.join("")}</row>`;
    })
    .join("");
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
  const sharedStrings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
    shared.map((text) => `<si><t>${escapeXml(text)}</t></si>`).join("") +
    `</sst>`;
  return buildZip(
    {
      "[Content_Types].xml":
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
        `</Types>`,
      "_rels/.rels":
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
      "xl/workbook.xml":
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId3"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels":
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
        `</Relationships>`,
      "xl/worksheets/sheet1.xml": sheet,
      "xl/sharedStrings.xml": sharedStrings,
    },
    // Stored, so the package outgrows the 4 KB mini stream, which
    // msoffcrypto-tool writes corruptly.
    ["xl/worksheets/sheet1.xml"]
  );
}

// The UnionBank layout (from the unionbank-statement-parser skill): a header
// block with labels in column B and values in the last populated cell, then a
// DATE | DESCRIPTION | CURRENCY | AMOUNT table. Charges positive, credits negative.
const UNIONBANK_ROWS = [
  [2, [null, "ACCOUNT NAME", null, "JUANA DELA CRUZ"]],
  [3, [null, "CARD NUMBER", null, "4000-XXXX-XXXX-0001"]],
  [4, [null, "STATEMENT BALANCE", null, 1554.04]],
  [5, [null, "MINIMUM AMOUNT DUE", null, 850]],
  [6, [null, "PAYMENT DUE DATE", null, "08/23/2026"]],
  [7, [null, "STATEMENT DATE", null, "08/03/2026"]],
  [8, [null, "PREVIOUS BALANCE", null, 5000]],
  [9, [null, "PURCHASES & ADVANCES", null, 2660.73]],
  [10, [null, "PAYMENTS & CREDITS", null, -6106.69]],
  [11, [null, "TOTAL AMOUNT DUE", null, 1554.04]],
  [14, ["DATE", "DESCRIPTION", "CURRENCY", "AMOUNT"]],
  [15, [{ inline: "07/05/2026" }, { inline: "SARI SARI STORE QUEZON PH" }, { inline: "PHP" }, 150]],
  [16, [{ inline: "07/05/2026" }, { inline: "SARI SARI STORE QUEZON PH" }, { inline: "PHP" }, 150]],
  [17, [{ inline: "07/12/2026" }, { inline: "BDO BILLS PAYMENT" }, { inline: "PHP" }, -5000]],
  [
    18,
    [
      { inline: "07/20/2026" },
      { inline: "ONLINE SHOP & CO MAKATI PH" },
      { inline: "PHP" },
      1264.04,
    ],
  ],
  [
    19,
    [{ inline: "07/21/2026" }, { inline: "ONLINE SHOP & CO MAKATI PH" }, { inline: "PHP" }, -10],
  ],
  [20, [{ inline: "" }, { inline: "" }, { inline: "" }, null]],
  [21, [{ inline: "08/01/2026" }, { inline: "LATE PAYMENT FEE" }, { inline: "PHP" }, 1096.69]],
  [22, [{ inline: "08/02/2026" }, { inline: "ZERO AMOUNT ADJUSTMENT" }, { inline: "PHP" }, 0]],
  [
    23,
    [
      { inline: "08/02/2026" },
      { inline: "LATE PAYMENT FEE REVERSAL" },
      { inline: "PHP" },
      -1096.69,
    ],
  ],
  [24, [{ inline: "*** END OF STATEMENT ***" }]],
];

function encryptOffice(source, target, password) {
  execFileSync("uvx", [
    "--from",
    "msoffcrypto-tool",
    "msoffcrypto-tool",
    "-e",
    "-p",
    password,
    source,
    target,
  ]);
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

  const plainUnionBank = join(workDir, "unionbank.xlsx");
  writeFileSync(plainUnionBank, buildXlsx("Sheet0", UNIONBANK_ROWS));
  encryptOffice(plainUnionBank, join(OUT_DIR, "unionbank-credit-card.xlsx"), FIXTURE_PASSWORD);

  const plainNotes = join(workDir, "notes.xlsx");
  const noteRows = Array.from({ length: 80 }, (_, index) => [
    index + 1,
    [`Meeting note ${index + 1}`, "nothing to import here"],
  ]);
  writeFileSync(plainNotes, buildXlsx("Notes", noteRows));
  encryptOffice(plainNotes, join(OUT_DIR, "not-a-statement.xlsx"), FIXTURE_PASSWORD);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
console.log(`Wrote fixtures to ${OUT_DIR} (password: ${FIXTURE_PASSWORD})`);
