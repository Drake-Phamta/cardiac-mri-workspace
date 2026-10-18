/*
 * SCR-06 touch handling — pure, so node can test it; ReviewCorrectionScreen.js
 * only feeds it PanResponder events.
 *
 * The rules are the ones Spike A measured as A11 on the A17 (12/12 second-finger
 * interruptions rolled back, 0 strokes committed in a multi-finger gesture),
 * ADAPTED from the responder in spikes/spike_a_2d/app/App.js (stages S5/S8) -
 * re-written as a pure module, not imported:
 *   - in BRUSH mode one finger paints from the moment it lands: one gesture,
 *     one stroke;
 *   - a second finger makes the gesture navigation and ROLLS BACK the stroke
 *     (END_SECOND_FINGER) - `10` §5: navigation must not edit;
 *   - the system taking the gesture away rolls it back too (END_TERMINATED);
 *   - only a clean lift commits (END_RELEASE);
 *   - two fingers pinch-zoom about their midpoint and pan; one finger pans in
 *     PAN mode, and in a gesture that has already become navigation.
 *
 * Points are CANVAS coordinates: page coordinates minus the canvas origin,
 * which is how the spike got coordinates that do not depend on which child
 * view a finger landed on.
 */

import { clampZoom, zoomAbout, panBy } from '../../../../app/core/index.mjs';
import { END_RELEASE, END_SECOND_FINGER, END_TERMINATED } from '../../../../app/verticals/v4_review_and_findings/brush.mjs';

export const MODE = Object.freeze({ BRUSH: 'brush', PAN: 'pan' });

export function createGestureController({
  getSession, getSlice, getTransform, setTransform, getFitZoom, getMode, onStrokeEnd = null,
}) {
  let gest = null; // { prev: points, stroke: boolean }

  function endStroke(how) {
    gest.stroke = false;
    const r = getSession().endStroke(how);
    if (r && onStrokeEnd) onStrokeEnd(r);
    return r;
  }

  function grant(points) {
    // Never inherit a stroke whose end was not delivered.
    if (gest && gest.stroke) endStroke(END_TERMINATED);
    gest = { prev: points, stroke: false };
    const session = getSession();
    const t = getTransform();
    if (getMode() === MODE.BRUSH && points.length === 1 && session && t) {
      session.beginStroke(getSlice());
      gest.stroke = true;
      session.sample(points[0].x, points[0].y, t);
    }
  }

  // A finger landed while the gesture is live (the first one also arrives here).
  function fingers(points) {
    if (!gest) return;
    if (gest.stroke && points.length >= 2) endStroke(END_SECOND_FINGER);
    gest.prev = points;
  }

  function move(points) {
    if (!gest) return;
    const t = getTransform();
    if (!t) return;
    if (gest.stroke) {
      if (points.length === 1) {
        getSession().sample(points[0].x, points[0].y, t);
        gest.prev = points;
        return;
      }
      endStroke(END_SECOND_FINGER); // the second finger showed up on a move first
    }
    if (points.length !== gest.prev.length) { gest.prev = points; return; } // a finger added or lifted
    if (points.length >= 2) {
      const dist = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const mid = (p) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const d0 = dist(gest.prev);
      const m0 = mid(gest.prev);
      const m1 = mid(points);
      let next = t;
      if (d0 > 0) next = zoomAbout(next, clampZoom(t.zoom * (dist(points) / d0), getFitZoom()), m0.x, m0.y);
      setTransform(panBy(next, m1.x - m0.x, m1.y - m0.y));
    } else {
      setTransform(panBy(t, points[0].x - gest.prev[0].x, points[0].y - gest.prev[0].y));
    }
    gest.prev = points;
  }

  function release() {
    if (gest && gest.stroke) endStroke(END_RELEASE);
    gest = null;
  }

  function terminate() {
    if (gest && gest.stroke) endStroke(END_TERMINATED);
    gest = null;
  }

  return Object.freeze({
    grant, fingers, move, release, terminate,
    get active() { return gest !== null; },
    get stroking() { return Boolean(gest && gest.stroke); },
  });
}
