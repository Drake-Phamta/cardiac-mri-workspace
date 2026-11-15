// Stroke timing for SCR-06 (NFR-PERF-003: a stroke answers within 100 ms). It only writes logcat lines, as scriptedRuns.js does
// for the slice switches (CMW_SLICE): the screen works without it, and the phone computes nothing but the numbers of one stroke.
//
// One line per stroke, written when the stroke has ended and its last frame has been shown:
//   CMW_STROKE {"stroke","slice","tool","px","strokes_before","slices_open","runs_start","runs_end","ms_to_frame","moves","move_p50",
//               "move_p95","move_max","frames","gap_p50","gap_max","end","dev","mode"}
//   ms_to_frame   from the gesture's start in JS (onPanResponderGrant) to the first requestAnimationFrame callback after the
//                 state update that drew the first stamp: the first frame that shows the stroke
//   move_*        the same for every later move of the finger: from the move event to the frame after the update (ms)
//   gap_*         the time between two of those frames while the stroke goes on: 16.7 ms is 60 Hz, 50 ms is 20 Hz (ms)
//   strokes_before / slices_open / runs_start / runs_end   how many strokes were already committed (the undo depth), how many slices
//                 the session holds open (every slice the person has stepped to), and how many row runs the edit layers held when the
//                 stroke began and when it ended: what the per-frame cost is read against. A stroke's cost must not rise with
//                 slices_open (device session 2026-11-15, r6: 39 ms with one slice open, about 204 ms with seven)
//   end           release (a clean lift), terminated (the system took the gesture) or rolled_back (a second finger came)
// The time is read in JS, so it leaves out the touch panel and the delivery of the event to JS, and it ends at the frame callback,
// up to one frame (16.7 ms at 60 Hz) before the pixels are lit. Nothing identifies a person or a case: no case, run or review id, no
// coordinate, no pixel, no mask; only the slice number (as CMW_SLICE has it), the tool and the brush width, and counts and times.
// Read it on the laptop with mobile/scripts/stroke-timing-report.mjs.

export const STROKE_TAG = 'CMW_STROKE';

const defaultNow = () => (global.performance ? global.performance.now() : Date.now());
const defaultRaf = (fn) => requestAnimationFrame(fn);
const round = (v) => Math.round(v * 100) / 100;

// Nearest-rank percentile of an ascending array: the definition slice-timing-report.mjs uses.
export function nearestRank(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summary(values) {
  const v = values.slice().sort((a, b) => a - b);
  return { p50: v.length ? round(nearestRank(v, 50)) : null, p95: v.length ? round(nearestRank(v, 95)) : null, max: v.length ? round(v[v.length - 1]) : null };
}

/*
 * The screen calls, around the controller:
 *   touchStart() / touchMove() / touchEnd(how)   in the pan responder, before it hands the touch to the controller
 *   rendered(info)                                in an effect after every render of the canvas, with
 *                                                 { strokeActive, slice, tool, px, strokes, slices, runs, mode }
 * A stroke begins at the render that shows `strokeActive` after a touchStart, and is logged after the frame that follows the
 * touchEnd (or the render that shows the stroke gone, when the controller ended it itself).
 */
export function createStrokeTimer({ now = defaultNow, raf = defaultRaf, log = (line) => console.log(line), dev = null } = {}) {
  let seq = 0;
  let down = null; // the time of a touchStart that no stroke has claimed yet
  let moves = []; // start times of the moves whose frame has not come yet
  let cur = null; // the stroke being timed
  let queued = false;

  function finish() {
    const c = cur;
    cur = null;
    const mv = summary(c.moves);
    const gp = summary(c.gaps);
    seq += 1;
    log(`${STROKE_TAG} ${JSON.stringify({
      stroke: seq,
      slice: c.slice,
      tool: c.tool,
      px: c.px,
      strokes_before: c.strokesBefore,
      slices_open: c.slicesOpen,
      runs_start: c.runsStart,
      runs_end: c.runsEnd,
      ms_to_frame: c.first === null ? null : round(c.first),
      moves: c.moves.length,
      move_p50: mv.p50,
      move_p95: mv.p95,
      move_max: mv.max,
      frames: c.frames,
      gap_p50: gp.p50,
      gap_max: gp.max,
      end: c.ending,
      dev,
      mode: c.mode,
    })}`);
  }

  // One frame callback serves every render and move since the last one.
  function queue() {
    if (queued) return;
    queued = true;
    raf(() => {
      queued = false;
      if (!cur) { moves = []; return; }
      const t = now();
      if (cur.first === null) cur.first = t - cur.t0;
      for (const m of moves) cur.moves.push(t - m);
      moves = [];
      if (cur.lastFrame !== null) cur.gaps.push(t - cur.lastFrame);
      cur.lastFrame = t;
      cur.frames += 1;
      if (cur.ending) finish();
    });
  }

  return Object.freeze({
    touchStart() { down = now(); moves = []; },
    touchMove() { if (cur || down !== null) moves.push(now()); },
    touchEnd(how) {
      down = null;
      if (!cur) { moves = []; return; }
      cur.ending = how;
      queue();
    },
    rendered(info) {
      if (!cur && info.strokeActive && down !== null) {
        cur = {
          t0: down, first: null, lastFrame: null, frames: 0, moves: [], gaps: [], ending: null,
          slice: info.slice, tool: info.tool, px: info.px, strokesBefore: info.strokes, slicesOpen: info.slices, runsStart: info.runs, runsEnd: info.runs, mode: info.mode,
        };
        down = null;
      }
      if (!cur) { if (!info.strokeActive) moves = []; return; }
      cur.runsEnd = info.runs;
      // The controller ended the stroke itself (a second finger rolled it back): there is no release to wait for.
      if (!info.strokeActive && !cur.ending) cur.ending = 'rolled_back';
      queue();
    },
  });
}
