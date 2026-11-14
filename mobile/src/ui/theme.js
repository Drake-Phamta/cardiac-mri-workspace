/*
 * One palette for every vertical. Dark, because MRI is read on dark, and
 * because the overlay colours below were chosen against it.
 *
 * Touch targets: `10` §9 and TC-USAB-004 - nothing tappable is smaller than
 * MIN_TOUCH (48 dp, the Android guidance).
 */

export const MIN_TOUCH = 48;

export const color = Object.freeze({
  bg: '#0e1116',
  surface: '#161a20',
  surfaceHi: '#1b2027',
  border: '#282e36',
  text: '#e8eaed',
  textDim: '#8b939b',
  textFaint: '#6d757d',
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
});

export const space = Object.freeze({ xs: 4, s: 8, m: 12, l: 16, xl: 24 });

export const font = Object.freeze({
  mono: 'monospace',
  h1: 20,
  h2: 16,
  body: 14,
  small: 12,
});
