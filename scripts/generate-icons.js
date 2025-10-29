/* eslint-env node */
// Quick placeholder icon generator for PWA
import fs from "fs";
import { createCanvas } from "canvas";
import path from "path";

const sizes = [16, 32, 96, 192, 512];
const colors = {
  background: "#1e40af", // Primary blue theme color
  text: "#ffffff", // White text
};

// Ensure output directory exists
const iconsDir = path.join(process.cwd(), "public", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
  console.log(`✅ Created directory: ${iconsDir}`);
}

// Generate standard icons
sizes.forEach((size) => {
  try {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    // Background with rounded corners
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, size, size);

    // Text
    ctx.fillStyle = colors.text;
    ctx.font = `bold ${size / 2}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HH", size / 2, size / 2);

    // Save
    const buffer = canvas.toBuffer("image/png");
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Generated icon-${size}x${size}.png`);
  } catch (error) {
    console.error(`❌ Failed to generate icon-${size}x${size}.png:`, error);
    process.exit(1);
  }
});

// Apple touch icon (180x180)
try {
  const appleSize = 180;
  const appleCanvas = createCanvas(appleSize, appleSize);
  const appleCtx = appleCanvas.getContext("2d");

  appleCtx.fillStyle = colors.background;
  appleCtx.fillRect(0, 0, appleSize, appleSize);

  appleCtx.fillStyle = colors.text;
  appleCtx.font = `bold ${appleSize / 2}px Arial`;
  appleCtx.textAlign = "center";
  appleCtx.textBaseline = "middle";
  appleCtx.fillText("HH", appleSize / 2, appleSize / 2);

  const outputPath = path.join(iconsDir, "apple-touch-icon.png");
  fs.writeFileSync(outputPath, appleCanvas.toBuffer("image/png"));
  console.log("✅ Generated apple-touch-icon.png");
} catch (error) {
  console.error("❌ Failed to generate apple-touch-icon.png:", error);
  process.exit(1);
}

// Shortcut icons (96x96) - same as regular icon but for shortcuts
const shortcutSize = 96;

// "Add Transaction" shortcut icon
try {
  const addCanvas = createCanvas(shortcutSize, shortcutSize);
  const addCtx = addCanvas.getContext("2d");

  addCtx.fillStyle = colors.background;
  addCtx.fillRect(0, 0, shortcutSize, shortcutSize);

  addCtx.fillStyle = colors.text;
  addCtx.font = `bold ${shortcutSize / 2.5}px Arial`;
  addCtx.textAlign = "center";
  addCtx.textBaseline = "middle";
  addCtx.fillText("+", shortcutSize / 2, shortcutSize / 2);

  const outputPath = path.join(iconsDir, "shortcut-add.png");
  fs.writeFileSync(outputPath, addCanvas.toBuffer("image/png"));
  console.log("✅ Generated shortcut-add.png");
} catch (error) {
  console.error("❌ Failed to generate shortcut-add.png:", error);
  process.exit(1);
}

// "View Dashboard" shortcut icon
try {
  const dashboardCanvas = createCanvas(shortcutSize, shortcutSize);
  const dashboardCtx = dashboardCanvas.getContext("2d");

  dashboardCtx.fillStyle = colors.background;
  dashboardCtx.fillRect(0, 0, shortcutSize, shortcutSize);

  dashboardCtx.fillStyle = colors.text;
  dashboardCtx.font = `bold ${shortcutSize / 3}px Arial`;
  dashboardCtx.textAlign = "center";
  dashboardCtx.textBaseline = "middle";
  dashboardCtx.fillText("📊", shortcutSize / 2, shortcutSize / 2);

  const outputPath = path.join(iconsDir, "shortcut-dashboard.png");
  fs.writeFileSync(outputPath, dashboardCanvas.toBuffer("image/png"));
  console.log("✅ Generated shortcut-dashboard.png");
} catch (error) {
  console.error("❌ Failed to generate shortcut-dashboard.png:", error);
  process.exit(1);
}

console.log("\n✅ All icons generated successfully!");
console.log("📁 Icons saved to: public/icons/");
