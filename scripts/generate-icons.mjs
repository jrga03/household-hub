#!/usr/bin/env node
/**
 * Draws every icon, badge, shortcut icon and iOS splash image from the app mark
 * (src/assets/app-mark.svg), in Playwright's Chromium.
 *
 * Usage: npm run generate:icons
 *
 * Colors come from src/index.css: the light `--primary` tile and the light and dark
 * `--background` splash. Splash files are the ones index.html's
 * apple-touch-startup-image tags name, so the tags stay valid; to add a device,
 * add its tag there first.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const match = (pattern, text, what) => {
  const found = pattern.exec(text)?.[1];
  if (!found) throw new Error(`Found no ${what}.`);
  return found;
};

const markPath = match(/\sd="([^"]+)"/, read("src/assets/app-mark.svg"), "path in app-mark.svg");
const css = read("src/index.css");
const token = (block, name) =>
  match(new RegExp(`${block} \\{[^}]*?--${name}: ([^;]+);`), css, `--${name} in ${block}`);
const primary = token(":root", "primary");
const splashBackground = {
  light: token(":root", "background"),
  dark: token("\\.dark", "background"),
};

const mark = (scale) =>
  `<svg viewBox="0 0 24 24" width="${scale}%" height="${scale}%" fill="#fff">` +
  `<path fill-rule="evenodd" d="${markPath}"/></svg>`;
const glyph = (paths) =>
  `<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="#fff"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
     ${paths.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const htmlPage = (background, body) =>
  `<body style="margin:0;height:100vh;display:grid;place-items:center;background:${background}">
     ${body}</body>`;

// Install icons are full-bleed: the OS masks them to its own shape.
const fullBleed = (size, file) => ({
  file,
  width: size,
  height: size,
  html: htmlPage(primary, mark(60)),
});

const images = [
  fullBleed(16, "icons/icon-16x16.png"),
  fullBleed(32, "icons/icon-32x32.png"),
  fullBleed(180, "icons/apple-touch-icon.png"),
  fullBleed(192, "icons/icon-192x192.png"),
  fullBleed(512, "icons/icon-512x512.png"),
  // The mark's corners stay inside the maskable safe zone, a circle of 80% diameter.
  {
    file: "icons/icon-maskable-512x512.png",
    width: 512,
    height: 512,
    html: htmlPage(primary, mark(50)),
  },
  // Android draws the notification badge from its alpha channel alone.
  {
    file: "icons/badge-72x72.png",
    width: 72,
    height: 72,
    html: htmlPage("transparent", mark(100)),
    transparent: true,
  },
  // Lucide's plus and chart-column, the app's own icon set.
  {
    file: "icons/shortcut-add.png",
    width: 96,
    height: 96,
    html: htmlPage(primary, glyph(["M5 12h14", "M12 5v14"])),
  },
  {
    file: "icons/shortcut-dashboard.png",
    width: 96,
    height: 96,
    html: htmlPage(
      primary,
      glyph(["M3 3v16a2 2 0 0 0 2 2h16", "M18 17V9", "M13 17V5", "M8 17v-3"])
    ),
  },
];

const splashTile = (width, height) => {
  const tile = Math.round(Math.min(width, height) * 0.25);
  return `<div style="width:${tile}px;height:${tile}px;border-radius:22%;background:${primary};
    display:grid;place-items:center">${mark(60)}</div>`;
};
for (const [, file, dark, width, height] of read("index.html").matchAll(
  /href="\/(splash\/apple-splash-(dark-)?(\d+)-(\d+)\.png)"/g
)) {
  const background = dark ? splashBackground.dark : splashBackground.light;
  images.push({
    file,
    width: Number(width),
    height: Number(height),
    html: htmlPage(background, splashTile(Number(width), Number(height))),
  });
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, width, height, html, transparent = false } of images) {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.screenshot({ path: path.join(root, "public", file), omitBackground: transparent });
}
await browser.close();
console.log(`Wrote ${images.length} images to public/.`);
