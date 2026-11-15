/*
 * Fitting one line of text into a known width, decided from measured widths. Used by the floating app bar of a viewer
 * (AppHeader.js, FitText.js): its title and subtitle have a room that does not grow with the text, 96 dp at 320 dp, and
 * Android did not shrink them with Text adjustsFontSizeToFit (the device session of 2026-11-15, r7: "Error Insp..."), so the
 * app measures the text itself and picks the size.
 *
 * A hidden copy of the text, with the same style and no numberOfLines, is laid out in a wide box; its onTextLayout gives the
 * natural width of the line at one font size. This file decides what to measure next and what size to draw. It is pure: the
 * widths come in as a plain object { "17.00": 117.2 } (sizeKey of a size, the measured width in dp), so every decision can
 * be checked in Node.
 *
 * The path is the same for the same numbers: measure the base size; if the line does not fit, guess the size from the
 * ratio (width is nearly proportional to the size), round it down to a step, and measure that size too; if it is still too
 * wide, go one more step down, and so on, never below the minimum. A size that was measured is never measured again, and
 * the answer is settled when a measured size fits or the minimum is reached (then the line is cut with "...", as before).
 */

// The font sizes are in sp, like the style's fontSize (the system font scale multiplies them in the measurement and in
// the drawing alike, so it is not a parameter here).
export const FIT_STEP = 0.5;
// dp kept free at the end of the room: a line of exactly the room's width can still be wrapped or cut by the text engine.
export const FIT_SLACK = 1;
// Width of the box the hidden copy is laid out in: wider than any title, so the line is never wrapped.
export const FIT_PROBE_WIDTH = 1000;
// More steps than a size can have between 1 and any minimum scale above 0.
const MAX_STEPS = 64;

// The key of a font size in a widths object: a size with two decimals, so 13.5 and 13.500000001 are the same size.
export const sizeKey = (size) => (Math.round(size * 100) / 100).toFixed(2);

// The width of the line from the lines onTextLayout reports ([{ text, width, ... }]); null when there is nothing to
// read. More than one line means the box was too narrow for the text: the sum of their widths is larger than the box.
export function lineWidth(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    if (!line || typeof line.width !== 'number' || !Number.isFinite(line.width) || line.width < 0) return null;
    total += line.width;
  }
  return lines.length > 1 ? Math.max(total, FIT_PROBE_WIDTH) : total;
}

const validRoom = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const validWidth = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/*
 * { base, minScale, available, widths } -> { settled, size, fits, probe }
 *   base       the style's font size (sp), the largest size
 *   minScale   the smallest fraction of base the line may shrink to (BAR_TEXT_MIN_SCALE)
 *   available  the width of the room (dp), or null while the box has not been laid out
 *   widths     the measured widths so far, { [sizeKey(size)]: width in dp }
 * settled      true when the size is decided; size is then the font size to draw (sp)
 * fits         true when the line fits at that size, false when it is at the minimum and still too wide (it will be cut),
 *              null while it is not settled
 * probe        the size the hidden copy has to be measured at next, or null when nothing is waiting for a measurement
 */
export function fitFontSize({ base, minScale, available, widths, step = FIT_STEP, slack = FIT_SLACK }) {
  const min = base * minScale;
  const room = validRoom(available) ? available - slack : null;
  let size = base;
  for (let i = 0; i < MAX_STEPS; i += 1) {
    const w = validWidth(widths ? widths[sizeKey(size)] : undefined);
    if (w === null) return { settled: false, size: null, fits: null, probe: size };
    if (room === null) return { settled: false, size: null, fits: null, probe: null };
    if (w <= room) return { settled: true, size, fits: true, probe: null };
    if (size <= min) return { settled: true, size: min, fits: false, probe: null };
    const guess = Math.floor((size * room) / w / step) * step;
    size = Math.max(min, Math.min(guess, size - step));
  }
  return { settled: true, size: min, fits: false, probe: null };
}
