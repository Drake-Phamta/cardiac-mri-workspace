/*
 * The 2D slice view shared by SCR-03 and SCR-04: the viewport (MRI image, mask overlays as fill, outline or both,
 * pinch-zoom, pan, tap to source pixel), the slice scrubber, the overlay style chips, and the hook that turns a
 * mask URL into an overlay path.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { clampZoom, fitTransform, panBy, screenToSource, zoomAbout } from '../../lib/viewMath.mjs';
import { maskOutlinePath } from '../../lib/mask.mjs';
import { color, font, radius, space, MIN_TOUCH } from '../../components/theme';
import { scrubIndex, scrubPosition, sliceLabel } from './cases.mjs';
import {
  createPlayer, createRepeater, doubleTapTransform, isDoubleTap, OUTLINE_WIDTHS, OVERLAY_MODE, OVERLAY_MODES, overlayStyle,
} from './sliceControls.mjs';

const TAP_MAX_TRAVEL = 6;
const TAP_MAX_MS = 400;
const now = () => (global.performance ? global.performance.now() : Date.now());

function Grid({ nx, ny }) {
  const step = 64;
  const lines = [];
  for (let x = step; x < nx; x += step) lines.push(<Line key={`x${x}`} x1={x} y1={0} x2={x} y2={ny} stroke="#2b3440" strokeWidth={1} />);
  for (let y = step; y < ny; y += step) lines.push(<Line key={`y${y}`} x1={0} y1={y} x2={nx} y2={y} stroke="#2b3440" strokeWidth={1} />);
  return (
    <>
      <Rect x={0} y={0} width={nx} height={ny} fill="#0b0e12" stroke="#3a4552" strokeWidth={2} />
      {lines}
    </>
  );
}

/*
 * One display transform {zoom, panX, panY} (viewMath.mjs) places everything: the image at (panX, panY), sized
 * nx*zoom by ny*zoom, and each overlay as an SVG of the same box with viewBox "0 0 nx ny". So mask pixel (x, y)
 * always sits over MRI pixel (x, y), and zoom / pan never touch mask data.
 * Gestures (adapted from the 2D viewer prototype): one finger pans, two fingers pinch about their midpoint and pan
 * with it, adding or lifting a finger restarts the gesture, and a short still touch is a tap.
 * A layer is { key, path (filled runs), outline (boundary loops), color, opacity, visible, dashed }; overlayMode
 * and outlineWidth (screen px) say which of the two paths are drawn (sliceControls.mjs overlayStyle).
 */
export default function SliceViewport({
  shape, imageUri, onImageLoad, onImageError, layers = [], placeholderNote = null, resetKey, onTap,
  overlayMode = OVERLAY_MODE.FILL, outlineWidth = 2,
}) {
  const nx = shape ? shape[0] : null;
  const ny = shape ? shape[1] : null;
  const [xf, setXf] = useState(null);
  const xfRef = useRef(null);
  const fitRef = useRef(null);
  const viewRef = useRef(null);
  const origin = useRef({ x: 0, y: 0 });
  const size = useRef(null);
  const gest = useRef(null);
  const lastTap = useRef(null);

  const setTransform = useCallback((t) => { xfRef.current = t; setXf(t); }, []);

  const refit = useCallback(() => {
    if (!size.current || !nx || !ny) return;
    const fit = fitTransform(size.current.w, size.current.h, nx, ny);
    fitRef.current = fit;
    setTransform(fit);
  }, [nx, ny, setTransform]);

  // A new case (or new geometry) starts fitted; a new slice keeps the view.
  useEffect(() => { refit(); }, [refit, resetKey]);

  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    size.current = { w: width, h: height };
    if (viewRef.current) viewRef.current.measure((x, y, w, h, px, py) => { origin.current = { x: px, y: py }; });
    refit();
  }, [refit]);

  const pagePoints = (evt) => evt.nativeEvent.touches.map((t) => ({
    x: t.pageX - origin.current.x, y: t.pageY - origin.current.y,
  }));

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      const pts = pagePoints(evt);
      gest.current = { t0: now(), start: pts[0], prev: pts, maxFingers: pts.length, travel: 0 };
    },
    onPanResponderMove: (evt) => {
      const cur = gest.current;
      const t = xfRef.current;
      if (!cur || !t || !fitRef.current) return;
      const pts = pagePoints(evt);
      cur.maxFingers = Math.max(cur.maxFingers, pts.length);
      if (pts.length !== cur.prev.length) { cur.prev = pts; return; } // finger added or lifted
      if (pts.length >= 2) {
        const d = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const mid = (p) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
        const d0 = d(cur.prev);
        const m0 = mid(cur.prev);
        const m1 = mid(pts);
        let next = t;
        if (d0 > 0) next = zoomAbout(next, clampZoom(t.zoom * (d(pts) / d0), fitRef.current.zoom), m0.x, m0.y);
        next = panBy(next, m1.x - m0.x, m1.y - m0.y);
        cur.travel += Math.hypot(m1.x - m0.x, m1.y - m0.y) + Math.abs(d(pts) - d0);
        setTransform(next);
      } else {
        const dx = pts[0].x - cur.prev[0].x;
        const dy = pts[0].y - cur.prev[0].y;
        cur.travel += Math.hypot(dx, dy);
        setTransform(panBy(t, dx, dy));
      }
      cur.prev = pts;
    },
    onPanResponderRelease: () => {
      const cur = gest.current;
      gest.current = null;
      if (!cur || !xfRef.current || !nx) return;
      if (cur.maxFingers === 1 && cur.travel < TAP_MAX_TRAVEL && now() - cur.t0 < TAP_MAX_MS) {
        // A second tap close in time and place toggles fit / 2x about that point (OsiriX-style double tap).
        const tap = { t: now(), u: cur.start.x, v: cur.start.y };
        if (isDoubleTap(lastTap.current, tap) && fitRef.current) {
          lastTap.current = null;
          setTransform(doubleTapTransform(xfRef.current, fitRef.current, tap.u, tap.v));
          return;
        }
        lastTap.current = tap;
        if (onTap) {
          const src = screenToSource(cur.start.x, cur.start.y, xfRef.current, nx, ny);
          onTap(src, { u: cur.start.x, v: cur.start.y, zoom: xfRef.current.zoom / fitRef.current.zoom });
        }
      }
    },
    onPanResponderTerminate: () => { gest.current = null; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [nx, ny, onTap, setTransform]);

  const box = xf && nx ? { position: 'absolute', left: xf.panX, top: xf.panY, width: nx * xf.zoom, height: ny * xf.zoom } : null;

  return (
    <View style={s.viewport} ref={viewRef} onLayout={onLayout} {...responder.panHandlers}>
      {box && imageUri ? (
        // The same <Image> stays mounted across slices; only its source changes.
        <Image
          source={{ uri: imageUri }}
          style={box}
          resizeMode="stretch"
          fadeDuration={0}
          onLoad={onImageLoad}
          onError={onImageError}
        />
      ) : null}
      {box && !imageUri ? (
        <Svg style={box} width={box.width} height={box.height} viewBox={`0 0 ${nx} ${ny}`} preserveAspectRatio="none" pointerEvents="none">
          <Grid nx={nx} ny={ny} />
        </Svg>
      ) : null}
      {box ? layers.map((l) => {
        const st = overlayStyle({ mode: overlayMode, widthPx: outlineWidth, zoom: xf.zoom, dashed: l.dashed === true, opacity: l.opacity });
        const fill = st.fill && l.path ? l.path : null;
        const edge = st.stroke && l.outline ? l.outline : null;
        if (!l.visible || (!fill && !edge)) return null;
        return (
          <Svg
            key={l.key}
            style={box}
            width={box.width}
            height={box.height}
            viewBox={`0 0 ${nx} ${ny}`}
            preserveAspectRatio="none"
            pointerEvents="none"
          >
            {fill ? <Path d={fill} fill={l.color} fillOpacity={st.fillOpacity} /> : null}
            {edge ? (
              <Path
                d={edge}
                fill="none"
                stroke={l.color}
                strokeWidth={st.strokeWidth}
                strokeDasharray={st.strokeDasharray || undefined}
                strokeLinejoin="miter"
              />
            ) : null}
          </Svg>
        );
      }) : null}
      {!imageUri && placeholderNote ? (
        <View style={s.noteBox} pointerEvents="none">
          <Text style={s.note}>{placeholderNote}</Text>
        </View>
      ) : null}
      {!shape ? <Text style={s.note}>No geometry yet.</Text> : null}
      {xf && fitRef.current && xf.zoom / fitRef.current.zoom > 1.01 ? (
        <Text style={s.zoom} pointerEvents="none">×{(xf.zoom / fitRef.current.zoom).toFixed(1)}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  viewport: {
    width: '100%', aspectRatio: 1, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: color.border,
  },
  noteBox: { position: 'absolute', left: space.l, right: space.l, bottom: space.l, padding: space.s, borderRadius: 6, backgroundColor: 'rgba(14,17,22,0.85)' },
  note: { color: color.textDim, fontSize: font.small, textAlign: 'center' },
  zoom: { position: 'absolute', top: space.s, right: space.s, color: color.text, fontFamily: font.mono, fontSize: font.small, backgroundColor: 'rgba(14,17,22,0.7)', paddingHorizontal: 6, borderRadius: 4 },
});

/*
 * Slice navigation: a slider track plus step buttons. scrubIndex() maps a finger x to a slice, so the same x always
 * gives the same slice and both ends are reachable. Every change is reported; the screen's serial runner merges a
 * fast scrub. React Native core has no Slider, so a View and a PanResponder do the job.
 * Holding ◀ or ▶ repeats the step; Play (when onPlay is given) sweeps the slices, see useSlicePlayer.
 */

export function SliceScrubber({
  index, pending, total, onChange, onLongPressLabel, disabled = false, playing = false, onPlay = null,
}) {
  const [width, setWidth] = useState(0);
  const last = useRef(null);
  const widthRef = useRef(0);
  const totalRef = useRef(total);
  totalRef.current = total;
  // The slice the last step asked for, so a held button keeps moving before the screen re-renders.
  const asked = useRef(null);

  const emit = useCallback((x) => {
    const i = scrubIndex(x, widthRef.current, totalRef.current);
    if (i === null || i === last.current) return;
    last.current = i;
    onChange(i);
  }, [onChange]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => { last.current = null; emit(evt.nativeEvent.locationX); },
    onPanResponderMove: (evt, g) => { emit(g.moveX - (evt.nativeEvent.pageX - evt.nativeEvent.locationX)); },
    onPanResponderRelease: () => { last.current = null; },
    onPanResponderTerminate: () => { last.current = null; },
  }), [disabled, emit]);

  const shown = pending !== null && pending !== undefined ? pending : index;
  asked.current = shown;
  const thumb = Number.isInteger(shown) && total ? scrubPosition(shown, width, total) : 0;
  const step = (d) => {
    const from = asked.current;
    if (!Number.isInteger(from) || !total) return;
    const next = Math.max(0, Math.min(total - 1, from + d));
    if (next === from) return;
    asked.current = next;
    onChange(next);
  };

  return (
    <View style={scrub.root}>
      <View style={scrub.top}>
        <TouchableOpacity style={scrub.labelBox} onLongPress={onLongPressLabel} delayLongPress={800} activeOpacity={0.8} accessibilityRole="text">
          <Text style={scrub.label}>
            {sliceLabel(index, total)}
            {pending !== null && pending !== undefined && pending !== index ? `   → ${pending + 1} loading…` : ''}
          </Text>
        </TouchableOpacity>
        {onPlay ? (
          <TouchableOpacity
            style={[scrub.play, playing && scrub.playOn, disabled && scrub.btnD]}
            onPress={onPlay}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: playing }}
            accessibilityLabel={playing ? 'Pause the slice sweep' : 'Play: sweep through the slices'}
          >
            <Text style={[scrub.playT, playing && scrub.playTOn]}>{playing ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={scrub.row}>
        <Btn label="−10" a11y="Back 10 slices" onPress={() => step(-10)} disabled={disabled} />
        <Btn label="◀" a11y="Previous slice, hold to repeat" onPress={() => step(-1)} disabled={disabled} repeat />
        <View
          style={scrub.track}
          onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); }}
          {...responder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel={sliceLabel(index, total)}
        >
          <View style={scrub.rail} pointerEvents="none" />
          {width > 0 && total ? <View style={[scrub.thumb, { left: thumb - 10 }]} pointerEvents="none" /> : null}
        </View>
        <Btn label="▶" a11y="Next slice, hold to repeat" onPress={() => step(1)} disabled={disabled} repeat />
        <Btn label="+10" a11y="Forward 10 slices" onPress={() => step(10)} disabled={disabled} />
      </View>
    </View>
  );
}

// A step button. With `repeat`, holding it (after the long-press delay) steps again every REPEAT_EVERY_MS until the
// finger lifts; a short tap is one step.
function Btn({ label, a11y, onPress, disabled, repeat = false }) {
  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const repeater = useMemo(() => createRepeater({ fire: () => pressRef.current() }), []);
  useEffect(() => () => repeater.stop(), [repeater]);
  useEffect(() => { if (disabled) repeater.stop(); }, [disabled, repeater]);
  return (
    <TouchableOpacity
      style={[scrub.btn, disabled && scrub.btnD]}
      onPress={onPress}
      onLongPress={repeat ? () => repeater.start() : undefined}
      onPressOut={repeat ? () => repeater.stop() : undefined}
      delayLongPress={350}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y || label}
    >
      <Text style={scrub.btnT}>{label}</Text>
    </TouchableOpacity>
  );
}

/*
 * The Play button's state for a screen (sliceControls.mjs createPlayer). `displayed` is the snapshot on screen: each
 * new one tells the player its slice arrived. `failed` (the viewer shows an error state) and `locked` (a scripted
 * run) stop it. The screen calls stop() before any slice action of its own, so play never competes with the user.
 */
export function useSlicePlayer({ total, goTo, displayed, failed = false, locked = false }) {
  const [playing, setPlaying] = useState(false);
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const player = useMemo(
    () => (Number.isInteger(total) && total > 1
      ? createPlayer({ total, step: (z) => goToRef.current(z), onChange: setPlaying })
      : null),
    [total],
  );
  useEffect(() => () => { if (player) player.stop(); }, [player]);
  useEffect(() => { if (player && displayed) player.settled(displayed.sliceIndex); }, [player, displayed]);
  useEffect(() => { if (player && failed) player.failed(); }, [player, failed]);
  useEffect(() => { if (player && locked) player.stop(); }, [player, locked]);
  const toggle = useCallback(() => {
    if (!player) return;
    if (player.playing) player.stop();
    else if (displayed) player.start(displayed.sliceIndex);
  }, [player, displayed]);
  const stop = useCallback(() => { if (player) player.stop(); }, [player]);
  return { playing, toggle: player ? toggle : null, stop };
}

const scrub = StyleSheet.create({
  root: { marginTop: space.s },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.xs },
  labelBox: { flex: 1, minHeight: 40, justifyContent: 'center' },
  label: { color: color.text, fontFamily: font.mono, fontSize: font.body, textAlign: 'center', fontVariant: font.numeric },
  play: {
    minHeight: MIN_TOUCH, minWidth: 72, paddingHorizontal: space.m, borderRadius: radius.m, borderWidth: 1,
    borderColor: color.control, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center',
  },
  playOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  playT: { color: color.text, fontSize: font.body, fontWeight: '700' },
  playTOn: { color: color.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  track: { flex: 1, height: MIN_TOUCH, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: color.border },
  thumb: {
    position: 'absolute', top: (MIN_TOUCH - 20) / 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: color.accent, borderWidth: 2, borderColor: color.text,
  },
  btn: {
    minWidth: 44, minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.control,
    backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  btnD: { opacity: 0.4 },
  btnT: { color: color.text, fontSize: font.body, fontWeight: '700' },
});

/*
 * One mask layer for the viewport: content_url in, SVG path out, through the runtime's mask store (checksum
 * verified). A cached decode is returned in the same render, so a revisited slice draws its overlay with its image.
 * status: 'off' (no store or no URL), 'loading', 'ready' (path drawable), 'error' (`error` says why).
 */

const OFF = Object.freeze({ status: 'off', path: null, pixels: null, mask: null, error: null, url: null });

export function useMaskOverlay(store, url, size, checksum = null) {
  const width = size ? size.width : null;
  const height = size ? size.height : null;
  const expected = width && height ? { width, height } : null;
  const cached = store && url && expected ? store.peek(url, expected) : null;

  const [state, setState] = useState(OFF);

  useEffect(() => {
    if (!store || !url || !expected) { setState(OFF); return undefined; }
    if (store.peek(url, expected)) return undefined; // drawn from the cache below
    let alive = true;
    setState({ status: 'loading', path: null, pixels: null, mask: null, error: null, url });
    store.load(url, expected, { checksum }).then(
      (v) => { if (alive) setState({ status: 'ready', path: v.path, pixels: v.pixels, mask: v.mask, error: null, url }); },
      (err) => { if (alive) setState({ status: 'error', path: null, pixels: null, mask: null, error: String(err && err.message), url }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, url, width, height, checksum]);

  if (cached) return { status: 'ready', path: cached.path, pixels: cached.pixels, mask: cached.mask, error: null, url };
  // Never hand back a path that belongs to a previous URL.
  if (state.url !== url) return url && store && expected ? { status: 'loading', path: null, pixels: null, mask: null, error: null, url } : OFF;
  return state;
}

// A mask's outline path, traced once per decoded mask and only when an outline is shown.
const outlines = new WeakMap();
export function outlineOf(mask) {
  if (!mask || typeof mask !== 'object') return null;
  if (!outlines.has(mask)) outlines.set(mask, maskOutlinePath(mask));
  return outlines.get(mask);
}

/*
 * The overlay style chips under a viewer: Fill / Outline / Both, and the outline width in screen pixels.
 */
export function OverlayStyleChips({ mode, width, onMode, onWidth }) {
  const showsOutline = mode !== OVERLAY_MODE.FILL;
  return (
    <View style={chips.wrap}>
      <View style={chips.row}>
        <Text style={chips.label}>Draw</Text>
        {OVERLAY_MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[chips.chip, mode === m.key && chips.on]}
            onPress={() => onMode(m.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m.key }}
            accessibilityLabel={`Draw masks as ${m.label.toLowerCase()}`}
          >
            <Text style={[chips.t, mode === m.key && chips.tOn]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {showsOutline ? (
        <View style={chips.row}>
          <Text style={chips.label}>Outline</Text>
          {OUTLINE_WIDTHS.map((w) => (
            <TouchableOpacity
              key={w}
              style={[chips.chip, width === w && chips.on]}
              onPress={() => onWidth(w)}
              accessibilityRole="button"
              accessibilityState={{ selected: width === w }}
              accessibilityLabel={`Outline ${w} pixel${w === 1 ? '' : 's'} wide`}
            >
              <Text style={[chips.t, width === w && chips.tOn]}>{w} px</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const chips = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  label: { color: color.textDim, fontSize: font.small, minWidth: 52 },
  chip: {
    minHeight: MIN_TOUCH, minWidth: 56, paddingHorizontal: space.s, borderRadius: radius.s, borderWidth: 1,
    borderColor: color.control, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceHi,
  },
  on: { borderColor: color.accent, backgroundColor: color.accentBg },
  t: { color: color.textDim, fontSize: font.small, fontWeight: '600' },
  tOn: { color: color.accent },
});
