import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { compile } from "tailwindcss";
import { beforeAll } from "vitest";
import { resolveVar } from "./css-var";

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
async function compileTheme() {
  const theme = await readFile(themePath, "utf8");
  const compiler = await compile(theme, { base: path.dirname(themePath), loadStylesheet });
  return (classNames: string[]) => compiler.build(classNames);
}

/** Compiles the theme once before the suite's tests; the returned function builds CSS for the given classes. */
export function compiledThemeForSuite() {
  let build: ((classNames: string[]) => string) | undefined;
  beforeAll(async () => {
    build = await compileTheme();
  });
  return (classNames: string[]) => {
    if (!build) throw new Error("The theme compiles in beforeAll; call this inside a test");
    return build(classNames);
  };
}

/** The declarations of `selector`'s rule in `css`, with var() chains and rem resolved to their final values. */
export function declarationsIn(css: string, selector: string) {
  const rule = new RegExp(`(?:^|[\\s}])${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!rule?.[1]) throw new Error(`${selector} has no rule`);
  const lookup = (name: string) => new RegExp(`(?:^|[\\s{;])--${name}:\\s*([^;]+);`).exec(css)?.[1];
  const resolve = (value: string) => {
    const resolved = resolveVar(value, lookup);
    const rem = /^([\d.]+)rem$/.exec(resolved);
    return rem?.[1] ? `${Number(rem[1]) * 16}px` : resolved;
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
