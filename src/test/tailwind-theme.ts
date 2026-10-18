import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { compile } from "tailwindcss";

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

/** Compiles src/index.css the way the Vite plugin does; build() returns the CSS for the given classes. */
export async function compileTheme() {
  const theme = await readFile(themePath, "utf8");
  const compiler = await compile(theme, { base: path.dirname(themePath), loadStylesheet });
  return (classNames: string[]) => compiler.build(classNames);
}

/** The declarations of `selector`'s rule in `css`, with var() chains and rem resolved to their final values. */
export function declarationsIn(css: string, selector: string) {
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
