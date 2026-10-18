// WCAG 2 contrast ratio and APCA 0.0.98G-4g lightness contrast for oklch() tokens.

export interface Oklch {
  lightness: number;
  chroma: number;
  hue: number;
  alpha: number;
}

/** Gamma-encoded sRGB, each channel 0..1. */
export interface Srgb {
  r: number;
  g: number;
  b: number;
}

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/;

export function parseOklch(value: string): Oklch {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Not an oklch() color: ${value}`);
  }
  const [, lightness, chroma, hue, alpha, percent] = match;
  const alphaValue = alpha === undefined ? 1 : Number(alpha) / (percent ? 100 : 1);
  return {
    lightness: Number(lightness),
    chroma: Number(chroma),
    hue: Number(hue),
    alpha: alphaValue,
  };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const encodeChannel = (linear: number) =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

const decodeChannel = (encoded: number) =>
  encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;

/** Converts to sRGB, clipping out-of-gamut channels as browsers do. Ignores alpha. */
export function toSrgb({ lightness, chroma, hue }: Oklch): Srgb {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: clamp(encodeChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(encodeChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(encodeChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

/** Composites a translucent color over an opaque backdrop in gamma-encoded sRGB. */
export function composite(color: Oklch, backdrop: Srgb): Srgb {
  const top = toSrgb(color);
  const mix = (front: number, back: number) => front * color.alpha + back * (1 - color.alpha);
  return { r: mix(top.r, backdrop.r), g: mix(top.g, backdrop.g), b: mix(top.b, backdrop.b) };
}

function relativeLuminance({ r, g, b }: Srgb): number {
  return 0.2126 * decodeChannel(r) + 0.7152 * decodeChannel(g) + 0.0722 * decodeChannel(b);
}

export function wcagContrast(first: Srgb, second: Srgb): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function apcaLuminance({ r, g, b }: Srgb): number {
  const luminance = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
  const blackThreshold = 0.022;
  return luminance < blackThreshold ? luminance + (blackThreshold - luminance) ** 1.414 : luminance;
}

/** Signed Lc: positive for dark text on a light background, negative for the reverse. */
export function apcaContrast(text: Srgb, background: Srgb): number {
  const textY = apcaLuminance(text);
  const backgroundY = apcaLuminance(background);
  if (Math.abs(backgroundY - textY) < 0.0005) {
    return 0;
  }
  const scale = 1.14;
  const offset = 0.027;
  const lowClip = 0.1;

  if (backgroundY > textY) {
    const contrast = (backgroundY ** 0.56 - textY ** 0.57) * scale;
    return contrast < lowClip ? 0 : (contrast - offset) * 100;
  }
  const contrast = (backgroundY ** 0.65 - textY ** 0.62) * scale;
  return contrast > -lowClip ? 0 : (contrast + offset) * 100;
}
