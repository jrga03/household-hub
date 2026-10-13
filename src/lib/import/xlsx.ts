/**
 * Just enough of SpreadsheetML to read a worksheet's values: shared and inline
 * strings and numbers. Regular expressions stand in for DOMParser, which Web
 * Workers lack; the parts read here never nest an element inside itself.
 */
import { openZip } from "./zip";

export type Cell = string | number;

interface XmlElement {
  attributes: Record<string, string>;
  inner: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const decodeEntities = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    }
    if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return ENTITIES[name] ?? entity;
  });

/** Every `tag` element (any namespace prefix), in document order. */
function elements(xml: string, tag: string): XmlElement[] {
  const pattern = new RegExp(
    `<(?:\\w+:)?${tag}(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`,
    "g"
  );
  return [...xml.matchAll(pattern)].map(([, attributeText = "", inner = ""]) => ({
    attributes: Object.fromEntries(
      [...attributeText.matchAll(/([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
        ([, name = "", double, single]) => [name, decodeEntities(double ?? single ?? "")]
      )
    ),
    inner,
  }));
}

/** The text of a string item: its `t` runs joined, phonetic hints left out. */
const stringItemText = (xml: string) =>
  elements(xml.replace(/<(?:\w+:)?rPh[\s\S]*?<\/(?:\w+:)?rPh>/g, ""), "t")
    .map((run) => decodeEntities(run.inner))
    .join("");

/** "BC12" → 54 (zero-based column), or null without a column. */
function columnIndex(reference: string | undefined): number | null {
  const letters = reference && /^[A-Z]+/.exec(reference)?.[0];
  if (!letters) return null;
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue({ attributes, inner }: XmlElement, sharedStrings: string[]): Cell | undefined {
  const value = elements(inner, "v")[0]?.inner;
  switch (attributes.t) {
    case "inlineStr":
      return stringItemText(elements(inner, "is")[0]?.inner ?? "");
    case "s":
      return value === undefined ? undefined : sharedStrings[parseInt(value, 10)];
    case "str":
    case "d":
    case "e":
      return value === undefined ? undefined : decodeEntities(value);
    default:
      // eslint-disable-next-line arch/no-ad-hoc-money-parse -- any number cell; parsers turn amounts into cents
      return value === undefined || value.trim() === "" ? undefined : Number(value);
  }
}

/** A relationship target, resolved against the folder of the part that points to it. */
const resolveTarget = (folder: string, target: string) =>
  target.startsWith("/") ? target.slice(1) : `${folder}${target}`;

/**
 * The first worksheet's rows, top to bottom, each a sparse array of cells by
 * column (0 = A). Null when the file isn't a workbook.
 */
export async function readFirstSheet(zip: Uint8Array<ArrayBuffer>): Promise<Cell[][] | null> {
  const read = openZip(zip);
  const workbook = read && (await read("xl/workbook.xml"));
  const relationshipsXml = read && (await read("xl/_rels/workbook.xml.rels"));
  if (!read || !workbook || !relationshipsXml) return null;

  const relationships = elements(relationshipsXml, "Relationship").map(
    (relationship) => relationship.attributes
  );
  const sheetId = elements(workbook, "sheet")[0]?.attributes["r:id"];
  const sheetTarget = relationships.find((relationship) => relationship.Id === sheetId)?.Target;
  const sheet = sheetTarget && (await read(resolveTarget("xl/", sheetTarget)));
  if (!sheet) return null;

  const sharedStringsTarget = relationships.find((relationship) =>
    relationship.Type?.endsWith("/sharedStrings")
  )?.Target;
  const sharedStringsXml = sharedStringsTarget
    ? await read(resolveTarget("xl/", sharedStringsTarget))
    : undefined;
  const sharedStrings = elements(sharedStringsXml ?? "", "si").map((item) =>
    stringItemText(item.inner)
  );

  return elements(sheet, "row").map((row) => {
    const cells: Cell[] = [];
    let nextColumn = 0;
    for (const cell of elements(row.inner, "c")) {
      const column = columnIndex(cell.attributes.r) ?? nextColumn;
      const value = cellValue(cell, sharedStrings);
      if (value !== undefined) cells[column] = value;
      nextColumn = column + 1;
    }
    return cells;
  });
}
