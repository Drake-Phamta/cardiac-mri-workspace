/*
 * Design tokens v2: one dark palette for every screen and the colours that carry meaning (overlays, error
 * classes, model families, status). Plain data, so test/shell.test.mjs measures the contrast of every pair the
 * UI relies on. Screens import these through theme.js. Nothing tappable is smaller than MIN_TOUCH (48 dp).
 */

export const MIN_TOUCH = 48;

export const color = Object.freeze({
  bg: '#0e1116',
  surface: '#161a20',
  surfaceHi: '#1b2027',
  // Card edges and separators. Decoration only, so it stays subtle.
  border: '#282e36',
  // The edge of a control (button, chip, input): at least 3:1 on bg, surface and surfaceHi (WCAG 1.4.11).
  control: '#646e7a',
  text: '#e8eaed',
  textDim: '#8b939b',
  // At least 4.5:1 on bg, surface, surfaceHi and accentBg (the old #6d757d was 3.73:1 on surface).
  textFaint: '#838b93',
  accent: '#58a6ff',
  accentBg: '#132437',
  info: '#79c0ff',
  warn: '#e0a066',
  warnBg: '#2a1f14',
  danger: '#f08a95',
  dangerBg: '#2a1418',
  ok: '#5fd39a',
  okBg: '#12261c',
  // Mode badges: evaluation (ground truth present) vs inference & review.
  evaluation: '#5fd39a',
  inference: '#d2a8ff',
  inferenceBg: '#221a2e',
  // Behind the MRI slice.
  viewer: '#000000',
});

// Mask overlays on the MRI (SCR-03, SCR-05).
export const overlay = Object.freeze({
  prediction: '#f0883e',
  groundTruth: '#39c5cf',
});

// Error classes (SCR-04): no red / green pair. FP is also dashed when outlined, so it never depends on colour.
export const errorClass = Object.freeze({
  TP: '#56d364',
  FP: '#f778ba',
  FN: '#4c8dff',
});

// Model families in charts: colour and marker shape together.
export const family = Object.freeze([
  Object.freeze({ color: '#4c8dff', marker: 'circle' }),
  Object.freeze({ color: '#f0a14a', marker: 'triangle' }),
]);

// Screen-state tones. A state is always named in words as well (spec 10 §9).
export const status = Object.freeze({
  ok: color.ok, info: color.info, warn: color.warn, danger: color.danger,
});

export const space = Object.freeze({ xs: 4, s: 8, m: 12, l: 16, xl: 24 });

export const radius = Object.freeze({ s: 6, m: 8, l: 10, pill: 999 });

export const font = Object.freeze({
  mono: 'monospace',
  h1: 20,
  h2: 16,
  body: 14,
  small: 12,
  tiny: 11,
  // Digits of equal width, so numbers in a column line up.
  numeric: Object.freeze(['tabular-nums']),
});

// WCAG 2.x contrast ratio of two #rrggbb colours (1 to 21).
export function contrastRatio(a, b) {
  const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const luminance = (hex) => {
    const n = parseInt(String(hex).slice(1), 16);
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
