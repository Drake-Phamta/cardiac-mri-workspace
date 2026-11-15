/*
 * Design tokens, Direction A "Clinical viewer": a near-black base, the MRI as the hero, 1 dp hairlines instead of
 * boxes, and one blue accent for the active state. One CSS px in the mockups is one dp here. Plain data, so
 * test/shell.test.mjs measures the contrast of every pair the UI relies on. Screens import these through theme.js.
 * Nothing tappable is smaller than MIN_TOUCH (48 dp); a smaller visual pads its hit area with hitSlop.
 */

export const MIN_TOUCH = 48;

/*
 * The hitSlop that lifts a control `visual` dp high to MIN_TOUCH, half above and half below it, so it looks the same
 * and still has a 48 dp hit area. A control already MIN_TOUCH high gets none. Only the height is padded: a control
 * that is too narrow (a short label) gets a minWidth instead, because a side slop would run into its neighbour.
 */
export function hitSlopFor(visual) {
  const pad = Math.max(0, Math.ceil((MIN_TOUCH - visual) / 2));
  return { top: pad, bottom: pad, left: 0, right: 0 };
}

// Separators are 1 dp, as in the mockups (StyleSheet.hairlineWidth would be thinner on a dense screen).
export const HAIRLINE = 1;

const A = {
  // Surfaces, darkest first.
  viewer: '#000000', // behind the MRI
  bg: '#0a0b0d', // app background, header, tab bar
  surface: '#121419', // sheets and dialogs
  field: '#16191e', // search field, segmented track
  raised: '#1b1e24', // neutral tag, pressed row
  hair: '#262a31', // 1 dp separators: decoration only, never the edge of a control
  // Over the image. React Native has no backdrop blur, so the alpha alone keeps text readable.
  glass: 'rgba(12,14,17,0.86)', // floating chips and toolbars
  glassPanel: 'rgba(10,11,13,0.94)', // the viewer's bottom panel
  glassEdge: 'rgba(255,255,255,0.06)', // 1 dp inner edge of a glass chip or toolbar
  // Text, brightest first. t3 is for captions on solid surfaces only, never on glass.
  t1: '#e8ebef',
  t2: '#a2a9b3',
  t3: '#848c97',
  // State. Colour is never the only signal: a word or an icon always goes with it.
  accent: '#5aa2ff', // active tab, selected segment, slider fill, privacy on
  accentSoft: 'rgba(90,162,255,0.16)', // behind a selected segment, tool or primary button
  live: '#3ecf8e', // the live dot
  liveRing: 'rgba(62,207,142,0.16)',
  warn: '#e8a94a', // outlier tag and bars
  warnSoft: 'rgba(232,169,74,0.14)',
  danger: '#ff7a85', // "Run failed", blocking errors
  dangerSoft: 'rgba(255,122,133,0.14)',
  // Bars, tracks and ticks.
  barNeutral: '#6b727c', // Dice bar of a row that is not an outlier
  barTrack: '#22262c', // behind a 4 dp Dice bar
  track: '#30353d', // 1 dp chart track
  tick: '#3a4048', // chart and slider ticks
  sliderTrack: '#353a42',
};

export const color = Object.freeze({
  ...A,
  // Older names, still used by the screens that are not restyled yet. New code uses the names above.
  text: A.t1,
  textDim: A.t2,
  textFaint: A.t3,
  surfaceHi: A.raised,
  border: A.hair,
  // The edge of an outlined control: at least 3:1 on bg, surface, field and raised (WCAG 1.4.11).
  control: A.barNeutral,
  info: A.accent,
  ok: A.live,
  // The soft tints above, flattened onto bg, for code that needs a solid colour.
  accentBg: '#172334',
  warnBg: '#292116',
  dangerBg: '#2c1b1e',
  okBg: '#122a22',
});

// Mask overlays on the MRI (SCR-03, SCR-05). Each outline sits on a black halo, so it shows on bright tissue too.
export const overlay = Object.freeze({
  prediction: '#f0883e',
  groundTruth: '#39c5cf',
  halo: 'rgba(0,0,0,0.5)',
  groundTruthFill: 0.3, // fill opacity in Fill and Both
  predictionFill: 0.38,
});

// Error classes (SCR-04): no red / green pair. FP is also dashed when outlined, so it never depends on colour.
export const errorClass = Object.freeze({
  TP: '#56d364',
  FP: '#f778ba',
  FN: '#4c8dff',
});

// Model families in charts: colour and marker shape together.
export const family = Object.freeze({
  UNET: Object.freeze({ color: '#3987e5', marker: 'circle' }),
  DINOV2: Object.freeze({ color: '#d95926', marker: 'triangle' }),
});

// Screen-state tones. A state is always named in words as well (spec 10 §9).
export const status = Object.freeze({
  ok: A.live, info: A.accent, warn: A.warn, danger: A.danger,
});

// An 8 dp grid with 4 dp half steps. Page side margin l (16), gap between sections xl (24).
export const space = Object.freeze({ xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 });

// xs tag, s segment inside and thumbnail, m field / segmented / chip / button, l vertical toolbar and sheet.
export const radius = Object.freeze({ xs: 4, s: 6, m: 8, l: 10, pill: 999 });

// Fixed heights from the mockups.
export const size = Object.freeze({
  appBar: 56, tabBar: 56, row: 48, caseRow: 52, meterRow: 40, columnHeader: 24, groupHeader: 36,
  search: 40, filterTabs: 44, controlRow: 56, segmented: 32, chip: 36, button: 40,
  toolbar: 56, tool: 52, bottomPanel: 188, play: 56,
  icon: 24, iconSmall: 20, tabIcon: 22,
});

// One family, the system Roboto: fontFamily stays unset and only the weight changes.
export const font = Object.freeze({
  // Older names. `mono` is kept for screens that are not restyled yet; new code uses one family.
  mono: 'monospace',
  h1: 18,
  h2: 16,
  body: 14,
  small: 12,
  tiny: 11,
  // Digits of equal width, so numbers in a column line up (Dice, slice numbers, counts).
  numeric: Object.freeze(['tabular-nums']),
  // For a large number that stands alone (74, 45).
  proportional: Object.freeze(['proportional-nums']),
});

/*
 * The system font size multiplies every sp size, and the app is tested up to 1.3 (spec 03, NFR-USAB). Body text always
 * follows it. A one-line label whose room does not grow with the text (a tab bar label is a quarter of the width, a tool
 * label sits in a 48 dp button, a row label beside a chart) stops growing at this multiplier (Text
 * maxFontSizeMultiplier), so "Experiments" and "Outline" stay whole at 320 dp and at font scale 1.3. A number in a list
 * row is not capped: its cell is wide enough for 1.3 (minWidth).
 */
export const LABEL_FONT_CAP = 1.15;

/*
 * The floating bar of a viewer has Back, the Live word and up to two icon buttons round its title, so the room the title has does
 * not grow with the text: 96 dp at 320 dp (89 dp at font scale 1.3, where the Live word is wider), and "Error Inspector" is 117 dp at
 * 17 sp, 134 dp at the cap. A name or a subtitle that does not fit shrinks (Text adjustsFontSizeToFit) instead of being cut to
 * "Error Insp...", down to these fractions of its size, and is cut only if it still does not fit. At 320 dp the title needs 0.82 of its
 * size at font scale 1.0 and 0.67 at 1.3, the subtitle ("CASE_0029 · Raw") 1.0 and 0.82. A plain bar keeps following the system size.
 */
export const BAR_TEXT_MIN_SCALE = Object.freeze({ title: 0.6, subtitle: 0.75 });

// The type scale. Spread a role into a Text style: { ...type.body, color: color.t1 }.
// letterSpacing is in dp (the mockups give em: 0.08em at 11 dp = 0.88 dp).
export const type = Object.freeze({
  screenTitle: Object.freeze({ fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: 0.09 }),
  viewerTitle: Object.freeze({ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: 0.17 }),
  metric: Object.freeze({ fontSize: 32, lineHeight: 40, fontWeight: '500', letterSpacing: -0.32, fontVariant: font.proportional }),
  readout: Object.freeze({ fontSize: 17, lineHeight: 20, fontWeight: '600', fontVariant: font.numeric }),
  title: Object.freeze({ fontSize: 16, lineHeight: 24, fontWeight: '500' }),
  rowId: Object.freeze({ fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: 0.15, fontVariant: font.numeric }),
  body: Object.freeze({ fontSize: 14, lineHeight: 20, fontWeight: '400' }),
  secondary: Object.freeze({ fontSize: 13, lineHeight: 16, fontWeight: '400' }),
  caption: Object.freeze({ fontSize: 12, lineHeight: 16, fontWeight: '400' }),
  overline: Object.freeze({ fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0.88, textTransform: 'uppercase' }),
  micro: Object.freeze({ fontSize: 11, lineHeight: 14, fontWeight: '500', letterSpacing: 0.22 }),
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

// The solid colour an 'rgba(r,g,b,a)' token shows over a #rrggbb surface, for contrast checks.
export function flatten(rgba, under) {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(String(rgba).replace(/\s/g, ''));
  if (!m) return rgba;
  const a = Number(m[4]);
  const u = parseInt(String(under).slice(1), 16);
  const mix = (v, shift) => Math.round(Number(v) * a + ((u >> shift) & 255) * (1 - a));
  return `#${[mix(m[1], 16), mix(m[2], 8), mix(m[3], 0)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
