import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

const themePath = path.resolve(process.cwd(), "src", "index.css");

async function resolvePackageStylesheet(packageName: string) {
  const packageDir = path.resolve(process.cwd(), "node_modules", packageName);
  const manifest: { exports?: { ".": { style?: string } } } = JSON.parse(
    await readFile(path.join(packageDir, "package.json"), "utf8")
  );
  const stylesheet = manifest.exports?.["."].style;
  if (!stylesheet) throw new Error(`${packageName} has no style export`);
  return path.join(packageDir, stylesheet);
}

async function loadStylesheet(id: string, base: string) {
  const resolved = id.startsWith(".") ? path.resolve(base, id) : await resolvePackageStylesheet(id);
  return {
    path: resolved,
    base: path.dirname(resolved),
    content: await readFile(resolved, "utf8"),
  };
}

let buildClasses: (classNames: string[]) => string;

beforeAll(async () => {
  const theme = await readFile(themePath, "utf8");
  const compiler = await compile(theme, { base: path.dirname(themePath), loadStylesheet });
  buildClasses = (classNames) => compiler.build(classNames);
});

function declarationsOf(className: string) {
  return declarationsIn(buildClasses([className]), `\\.${className}`);
}

function declarationsIn(css: string, selector: string) {
  const rule = new RegExp(`(?:^|[\\s}])${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!rule?.[1]) throw new Error(`${selector} has no rule`);
  const resolve = (value: string): string => {
    const trimmed = value.trim();
    const reference = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(trimmed);
    if (!reference?.[1]) {
      const rem = /^([\d.]+)rem$/.exec(trimmed);
      return rem?.[1] ? `${Number(rem[1]) * 16}px` : trimmed;
    }
    const definition = new RegExp(`(?:^|[\\s{;])${reference[1]}:\\s*([^;]+);`).exec(css);
    if (definition?.[1]) return resolve(definition[1]);
    if (reference[2]) return resolve(reference[2]);
    throw new Error(`${reference[1]} is not defined`);
  };
  const declarations = new Map<string, string>();
  for (const declaration of rule[1].split(";")) {
    const [property, ...value] = declaration.split(":");
    if (property?.trim() && value.length > 0) {
      declarations.set(property.trim(), resolve(value.join(":")));
    }
  }
  return declarations;
}

describe("type roles", () => {
  it.each([
    ["text-display", "30px", "36px", "650"],
    ["text-title", "22px", "28px", "600"],
    ["text-heading", "17px", "24px", "600"],
    ["text-body", "15px", "22px", "400"],
    ["text-label", "13px", "18px", "550"],
    ["text-caption", "12px", "16px", "400"],
    ["text-figure", "34px", "40px", "600"],
  ])(
    "%s sets size %s, line-height %s and weight %s in one class",
    (role, size, lineHeight, weight) => {
      const declarations = declarationsOf(role);
      expect(declarations.get("font-size")).toBe(size);
      expect(declarations.get("line-height")).toBe(lineHeight);
      expect(declarations.get("font-weight")).toBe(weight);
    }
  );

  it("text-control is 16px on 24px so phones don't zoom into form fields", () => {
    const declarations = declarationsOf("text-control");
    expect(declarations.get("font-size")).toBe("16px");
    expect(declarations.get("line-height")).toBe("24px");
  });

  it.each([
    ["font-normal", "400"],
    ["font-medium", "550"],
    ["font-semibold", "600"],
    ["font-bold", "650"],
  ])("%s renders at weight %s", (className, weight) => {
    expect(declarationsOf(className).get("font-weight")).toBe(weight);
  });

  it("running text defaults to the body role", () => {
    const declarations = declarationsIn(buildClasses([]), "body");
    expect(declarations.get("font-size")).toBe("15px");
    expect(declarations.get("line-height")).toBe("22px");
  });

  it("font-sans is Source Sans 3 with the system stack as fallback", () => {
    expect(declarationsOf("font-sans").get("font-family")).toBe(
      '"Source Sans 3", system-ui, sans-serif'
    );
  });
});
