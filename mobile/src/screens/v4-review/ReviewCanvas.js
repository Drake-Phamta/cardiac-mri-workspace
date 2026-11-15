// The picture on SCR-06, full bleed under the shell's floating app bar: the MRI slice, the source prediction's edge,
// the edits and the brush ring; over it the top scrim, the corner annotations (the review's status, the slice's edit
// state), glass chips (what the finger is painting, loading and error messages) and, along the bottom, the last
// message and the colour key. It also takes the touches: one finger paints, two fingers zoom and pan. What a touch
// does is decided in reviewScreen.mjs (ctl.touch); this file only forwards touches and draws ctl's state.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { runsToPath } from '../../lib/mask.mjs';
import { Button, Tag } from '../../components/Controls';
import { TopScrim } from '../../components/Floating';
import { IconChevronDown } from '../../components/icons';
import { color, errorClass, HAIRLINE, LABEL_FONT_CAP, MIN_TOUCH, overlay, radius, size, space, type } from '../../components/theme';
import { statusWord } from './format.mjs';
import Notice from './Notice';
import { MASK_STATE, PIXELS, TOOL } from './reviewScreen.mjs';
import { createStrokeTimer } from './strokeTiming.mjs';
import { COLUMN_HEIGHT } from './ReviewTools';

// The bottom panel's height without the gesture inset (the app's SafeAreaView keeps that free) when its rows do not
// wrap: 16 + the slice row 48 + 8 + the size row 48 + 16 + the hairline. The picture is fitted between the bar above and
// the panel. A narrow screen or a large font wraps the panel's rows and makes it taller; the panel then reports its
// measured height (ReviewPanel onHeight) and the screen hands it down as `bottomInset`.
export const PANEL_HEIGHT = 137;
// The corner annotations sit under the floating bar, as in the mockup.
const CORNER_TOP = size.appBar + space.s;
// The top right readout ("Edits", then the slice's state) is two lines of the caption size, capped like a label in a fixed corner.
const CORNER_TEXT_HEIGHT = 2 * Math.ceil(type.caption.lineHeight * LABEL_FONT_CAP);

// The layers. The source prediction is drawn as the viewer draws a prediction (orange outline on a dark halo). Edits
// are filled: a saved correction in violet, an unsaved add in green and an unsaved erase in pink (never a red /
// green pair). Every layer also has a word in the key, so colour is never the only cue.
export const LAYER = Object.freeze({
  source: overlay.prediction,
  savedAdd: '#d2a8ff',
  savedErase: '#4b3366',
  unsavedAdd: errorClass.TP,
  unsavedErase: errorClass.FP,
});

const STATE_WORD = Object.freeze({
  [MASK_STATE.SOURCE]: 'Source',
  [MASK_STATE.UNSAVED]: 'Unsaved edits',
  [MASK_STATE.SAVED]: 'Saved',
});

// Why a slice is not drawn, in words for the person.
const PIXEL_REASON = Object.freeze({
  NO_DECODER: 'This version of the app cannot draw masks. Review status still works.',
  CONTRACT_DRIFT: 'The mask the server sent did not pass the app\'s checks, so it is not drawn.',
  VARIANT_MISMATCH: 'The server sent another prediction than this review\'s, so it is not drawn.',
  SOURCE_MASK_MISMATCH: 'The server sent a slice of another mask than this review\'s source prediction, so it is not drawn and cannot be edited.',
  TRANSPORT_UNREACHABLE: 'The mask could not be loaded.',
  BASE_UNAVAILABLE: 'This review is already corrected and continues from its latest version, but that version\'s slice could not be loaded. The slice cannot be edited: editing from the original prediction would drop the earlier correction.',
  BASE_MISMATCH: 'The server answered with another version than the review\'s latest, so the slice is not drawn. Refresh the review.',
});

// The runs of one kind of edit as ONE path. A stroke is hundreds of one-pixel-high runs and thirty strokes on a slice are
// thousands; drawn as one <Rect> each they were thousands of native shapes that were re-extracted on every touch move, and the
// phone's cost per frame rose from 16 ms to 39 ms after 30 strokes on one slice (device session 2026-11-15, r5). As a path they
// are four shapes whatever the number of strokes. The saved layer's runs are the same array until a save, so its path is built once.
export function runsPath(runs, kind) {
  let d = '';
  for (let i = 0; i < runs.length; i += 1) {
    const r = runs[i];
    if (r.kind === kind) d += `M${r.x} ${r.y}h${r.len}v1h-${r.len}z`;
  }
  return d;
}
function EditPath({ runs, kind, fill, opacity, testID }) {
  const d = useMemo(() => runsPath(runs, kind), [runs, kind]);
  return d ? <Path d={d} fill={fill} opacity={opacity} testID={testID} /> : null;
}

// A glass chip over the image; its text is cut to one line, so it never reaches past the picture's edge.
function GlassChip({ text, tint = color.t1, testID, accessibilityLabel }) {
  return (
    <View style={s.chip} accessibilityLabel={accessibilityLabel} testID={testID}>
      <Text style={[s.chipT, { color: tint }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// The colour key: a swatch and a word for each layer.
function Legend() {
  const item = (fill, label, line = false) => (
    <View style={s.legendItem} key={label}>
      <View style={[s.swatch, line ? { borderColor: fill, borderWidth: 2 } : { backgroundColor: fill }]} />
      <Text style={s.legendT}>{label}</Text>
    </View>
  );
  return (
    <View style={s.legend} pointerEvents="none">
      {item(LAYER.source, 'Source edge', true)}
      {item(LAYER.savedAdd, 'Saved')}
      {item(LAYER.unsavedAdd, 'Added')}
      {item(LAYER.unsavedErase, 'Erased')}
    </View>
  );
}

// How long a message about something that went well ("Saved · version 2") stays over the picture. A refusal stays until
// it is tapped, because it has to be read.
export const NOTICE_MS = 4000;

// onStatus: opens the review sheet, where the status is changed.
export default function ReviewCanvas({ ctl, st, onStatus, bottomInset = PANEL_HEIGHT }) {
  const ref = useRef(null);
  const canvas = useRef(null);
  const [canvasH, setCanvasH] = useState(null);
  // A message with no words is not shown: never an empty box over the picture.
  const notice = st.notice && st.notice.text ? st.notice : null;
  useEffect(() => {
    if (!notice || notice.kind === 'refused') return undefined;
    const timer = setTimeout(() => ctl.dismissNotice(), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, ctl]);
  const origin = useRef({ x: 0, y: 0 });
  // One CMW_STROKE line per stroke (strokeTiming.mjs): the time from the touch to the first frame that shows it, per move, per frame.
  const timer = useMemo(() => createStrokeTimer({ dev: typeof __DEV__ !== 'undefined' ? __DEV__ : null }), []);
  const points = (evt) => evt.nativeEvent.touches.map((t) => ({ x: t.pageX - origin.current.x, y: t.pageY - origin.current.y }));
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => { timer.touchStart(); ctl.touch.grant(points(evt)); },
    onPanResponderStart: (evt) => ctl.touch.fingers(points(evt)),
    onPanResponderMove: (evt) => { timer.touchMove(); ctl.touch.move(points(evt)); },
    onPanResponderRelease: () => { timer.touchEnd('release'); ctl.touch.release(); },
    onPanResponderTerminate: () => { timer.touchEnd('terminated'); ctl.touch.terminate(); },
  }), [ctl, timer]);

  // Fit the picture between the bar and the panel. It runs when the canvas is laid out and again when the panel's
  // height changes (a wrapped row): a view the person zoomed or panned stays as it is, only its fit is new.
  const fitViewport = useCallback(() => {
    if (canvas.current) ctl.setViewport(canvas.current.width, canvas.current.height, { top: size.appBar, bottom: bottomInset });
  }, [ctl, bottomInset]);
  useEffect(() => { fitViewport(); }, [fitViewport]);
  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    canvas.current = { width, height };
    setCanvasH(height);
    fitViewport();
    // Touches arrive in page coordinates whichever child they land on, so keep the canvas origin.
    if (ref.current) ref.current.measure((x, y, w, h, px, py) => { origin.current = { x: px, y: py }; });
  }, [fitViewport]);

  // The tool column sits on the bottom panel at the right edge, so its top is its height above the panel. On a short screen
  // (320 dp, where the panel wraps and is taller, or a large font) that top is above the bottom of the readout at the top
  // right, and the readout and the stamp chip would be covered by it ("Saved" was hidden behind the column). Then they stop
  // left of the column instead of at the edge; where the column starts lower, they stay at the edge as in the mockup.
  const columnTop = canvasH === null ? Infinity : canvasH - bottomInset - space.l - COLUMN_HEIGHT;
  const clearOfTools = columnTop < CORNER_TOP + CORNER_TEXT_HEIGHT + space.s ? space.l + size.toolbar + space.s : space.l;
  const t = st.transform;
  const layers = st.layers;
  const edits = layers && !st.sourceOnly;
  const [nx, ny] = st.shape || [0, 0];
  const px = st.slice && st.slice.pixels;
  const word = st.slice && st.slice.maskState ? STATE_WORD[st.slice.maskState] : null;
  // While Source is held the corner says what is shown instead of the slice's state.
  const editsText = word && st.sourceOnly ? 'Source only' : word;
  const unsaved = st.slice && st.slice.maskState === MASK_STATE.UNSAVED && !st.sourceOnly;
  const mri = st.slice ? st.slice.mriUri : null;
  // After every render, tell the timer what is on screen; it logs a stroke once its last frame has been shown.
  useEffect(() => {
    timer.rendered({
      strokeActive: Boolean(st.brush && st.brush.strokeActive),
      slice: st.slice ? st.slice.index : null,
      tool: st.brush ? st.brush.tool : null,
      px: st.brushPx,
      strokes: st.brush ? st.brush.undoDepth : 0,
      slices: st.brush ? st.brush.loadedSlices.length : 0,
      runs: layers ? layers.saved.length + layers.unsaved.length : 0,
      mode: st.fixture ? 'fixture' : 'live',
    });
  });
  const stamp = st.ring ? `${st.brush.tool === TOOL.ERASE ? 'Erase' : 'Add'} · ${st.brushPx} px` : null;
  return (
    <View style={s.canvas} ref={ref} collapsable={false} onLayout={onLayout} {...responder.panHandlers}>
      {t && mri && (
        <Image
          source={{ uri: mri }}
          resizeMode="stretch"
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', left: t.panX, top: t.panY, width: nx * t.zoom, height: ny * t.zoom }}
        />
      )}
      {t && (
        <Svg width="100%" height="100%" pointerEvents="none">
          <G transform={`translate(${t.panX} ${t.panY}) scale(${t.zoom})`}>
            <Rect x={0} y={0} width={nx} height={ny} fill={mri ? 'none' : color.surface} />
            {layers && st.sourceOnly && (
              <Path d={runsToPath(layers.source)} fill={LAYER.source} opacity={0.4} testID="source-fill" />
            )}
            {/* The source's edge on a dark halo, 1.75 screen pixels wide at any zoom, under the edits: the edits are
                see-through, so the line still shows where an edit crosses it. */}
            {layers && (
              <Path d={layers.sourceOutline} fill="none" stroke={overlay.halo} strokeWidth={3.5 / t.zoom}
                strokeLinecap="square" testID="source-halo" />
            )}
            {layers && (
              <Path d={layers.sourceOutline} fill="none" stroke={LAYER.source} strokeWidth={1.75 / t.zoom}
                strokeLinecap="square" testID="source-outline" />
            )}
            {edits && <EditPath runs={layers.saved} kind="add" fill={LAYER.savedAdd} opacity={0.75} testID="edit-saved-add" />}
            {edits && <EditPath runs={layers.saved} kind="erase" fill={LAYER.savedErase} opacity={0.85} testID="edit-saved-erase" />}
            {edits && <EditPath runs={layers.unsaved} kind="add" fill={LAYER.unsavedAdd} opacity={0.75} testID="edit-unsaved-add" />}
            {edits && <EditPath runs={layers.unsaved} kind="erase" fill={LAYER.unsavedErase} opacity={0.75} testID="edit-unsaved-erase" />}
            {/* The brush ring: as wide as one stamp, around the pixel under the finger; white on a dark rim so it
                shows on any image. */}
            {st.ring && (
              <G testID="brush-ring">
                <Circle cx={st.ring.cx} cy={st.ring.cy} r={st.ring.r} fill="none" stroke="#000000" strokeOpacity={0.6}
                  strokeWidth={3 / t.zoom} />
                <Circle cx={st.ring.cx} cy={st.ring.cy} r={st.ring.r} fill="none" stroke="#ffffff" strokeWidth={1.5 / t.zoom} />
              </G>
            )}
          </G>
        </Svg>
      )}

      {/* The scrim under the floating app bar: above the picture, below the annotations. */}
      <TopScrim />

      {/* Top left: the review's status as a tag (it opens the review sheet). Top right: the slice's edit state. */}
      <TouchableOpacity style={s.statusBtn} onPress={onStatus} accessibilityRole="button"
        accessibilityLabel={`Review: ${statusWord(st.review.status)}. Open the review.`} testID="review-status">
        <View><Tag label={statusWord(st.review.status)} tone={st.review.status === 'FLAGGED' ? 'warn' : 'neutral'} /></View>
        <IconChevronDown size={14} strokeWidth={2} color={color.t2} />
      </TouchableOpacity>
      <View style={[s.cornerRight, { right: clearOfTools }]} pointerEvents="none">
        <Text style={[s.cornerLabel, s.right]} numberOfLines={1} maxFontSizeMultiplier={LABEL_FONT_CAP}>Edits</Text>
        {editsText ? (
          <Text style={[s.cornerValue, s.right, unsaved && s.warn]} numberOfLines={1} maxFontSizeMultiplier={LABEL_FONT_CAP} testID="mask-state">{editsText}</Text>
        ) : null}
      </View>

      <View style={[s.chips, { right: clearOfTools }]} pointerEvents="none" testID="canvas-chips">
        {px && px.kind === PIXELS.SYNTHETIC && (
          <GlassChip text="Synthetic stand-in: fixture mode has no pixels. Not a prediction, not patient data." tint={color.warn} />
        )}
        {px && px.kind === PIXELS.SERVED && !mri && st.slice.mriReason && (
          <GlassChip text="The MRI image could not be loaded; the masks are drawn on a dark background." tint={color.t2} />
        )}
        {/* A finger hides the ring when zoomed out, so the stamp is also said in words; the pixel is for a screen reader. */}
        {stamp ? (
          <GlassChip text={stamp} testID="painting" accessibilityLabel={`${stamp} wide, at x ${st.ring.x}, y ${st.ring.y}`} />
        ) : null}
      </View>

      {px && px.kind === PIXELS.LOADING && <Text style={s.message}>Loading slice…</Text>}
      {px && px.kind === PIXELS.UNAVAILABLE && (
        <View style={s.messageBox}>
          <Text style={s.messageT} testID="pixels-unavailable">
            {PIXEL_REASON[px.reason] || 'This slice could not be drawn.'}
          </Text>
          {px.retryable && <Button label="Retry slice" variant="secondary" onPress={() => ctl.retrySlice()} />}
        </View>
      )}

      {/* Bottom left, over the picture: what the last action did (tap to dismiss it), then the colour key. A message
          appearing never changes the size of the canvas, so it never changes the zoom. */}
      <View style={[s.bottom, { bottom: bottomInset + space.l }]} pointerEvents="box-none">
        {notice ? (
          <TouchableOpacity style={s.notice} onPress={() => ctl.dismissNotice()} accessibilityRole="button"
            accessibilityLiveRegion="polite" accessibilityHint="Dismisses this message" testID="canvas-notice">
            <Notice notice={notice} />
          </TouchableOpacity>
        ) : null}
        <Legend />
      </View>
    </View>
  );
}

const shadow = { textShadowColor: '#000000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const s = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.viewer, overflow: 'hidden' },
  statusBtn: { position: 'absolute', top: size.appBar, left: space.l, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  cornerRight: { position: 'absolute', top: CORNER_TOP, maxWidth: '55%' },
  cornerLabel: { ...type.caption, color: color.t2, ...shadow },
  cornerValue: { ...type.caption, fontWeight: '500', color: color.t1, ...shadow },
  right: { textAlign: 'right' },
  warn: { color: color.warn },
  chips: { position: 'absolute', top: CORNER_TOP + 2 * MIN_TOUCH - space.s, left: space.l, gap: space.xs, alignItems: 'flex-end' },
  chip: {
    maxWidth: '100%', paddingHorizontal: space.s, paddingVertical: space.xs, borderRadius: radius.s,
    backgroundColor: color.glass, borderWidth: HAIRLINE, borderColor: color.glassEdge,
  },
  chipT: { ...type.micro },
  message: { ...type.body, color: color.t1, position: 'absolute', top: '45%', left: space.l, right: space.l, textAlign: 'center' },
  messageBox: { position: 'absolute', top: '30%', left: space.l, right: space.l, alignItems: 'center', gap: space.s },
  messageT: { ...type.body, color: color.t1, textAlign: 'center' },
  // clear of the tool column (56 dp wide, 16 dp from the right edge) and sitting on the bottom panel
  bottom: {
    position: 'absolute', left: space.l, right: space.l + size.toolbar + space.s, gap: space.s,
    alignItems: 'flex-start',
  },
  notice: {
    paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: radius.m, minHeight: MIN_TOUCH, justifyContent: 'center',
    backgroundColor: color.glass, borderWidth: HAIRLINE, borderColor: color.glassEdge,
  },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.m, paddingHorizontal: space.s,
    paddingVertical: space.xs, borderRadius: radius.s, backgroundColor: color.glass, borderWidth: HAIRLINE,
    borderColor: color.glassEdge,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  legendT: { ...type.caption, color: color.t2 },
});
