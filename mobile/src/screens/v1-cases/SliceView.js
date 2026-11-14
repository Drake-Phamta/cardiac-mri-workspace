/*
 * The 2D slice viewport: the MRI slice, mask overlays on top, pinch-zoom and
 * pan, and a tap that reports the source pixel under the finger.
 *
 * Geometry. Everything is placed with ONE display transform {zoom, panX,
 * panY} from app/core viewMath.mjs (itself a provenance copy of Spike A's
 * measured viewerMath.js): the image at (panX, panY) sized nx*zoom by
 * ny*zoom, each overlay an SVG of the same box whose viewBox is the source
 * grid "0 0 nx ny". A mask pixel (x, y) is therefore drawn exactly over MRI
 * pixel (x, y) at every zoom and pan (TC-MASK-001), and zoom / pan never
 * touch mask data (`07` §8 invariant 2) - they only change three numbers.
 *
 * Gestures. PROVENANCE - adapted, not imported (product code never imports
 * spikes/**):
 *   source : spikes/spike_a_2d/app/App.js - pagePoints, PanResponder
 *            onPanResponderGrant / Move / Release / Terminate, S4 "Xem" mode
 *   commit : 0e3e54f "SPIKE_A S8: save/reload for A8, and the two scripts that conclude A10/A11"
 *   blob   : a8fb8a512c8a1ace2e3dbf487d11d1ee1218dc08
 *   kept   : one finger pans, two fingers pinch about their midpoint and
 *            pan by its movement, a finger added or lifted re-bases the
 *            gesture, a short still touch is a tap, Android termination
 *            ends the gesture cleanly (A2 passed 16/16 on the A17 with it)
 *   dropped: the brush (S5 - that is SCR-06's, V4), frame-gap logging, the
 *            A2 checksum harness
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { clampZoom, fitTransform, panBy, screenToSource, zoomAbout } from '../../lib/viewMath.mjs';
import { color, font, space, MIN_TOUCH } from '../../components/theme';
import { scrubIndex, scrubPosition, sliceLabel } from './cases.mjs';

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

export default function SliceViewport({
  shape, imageUri, onImageLoad, onImageError, layers = [], placeholderNote = null, resetKey, onTap,
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
      if (cur.maxFingers === 1 && cur.travel < TAP_MAX_TRAVEL && now() - cur.t0 < TAP_MAX_MS && onTap) {
        const src = screenToSource(cur.start.x, cur.start.y, xfRef.current, nx, ny);
        onTap(src, { u: cur.start.x, v: cur.start.y, zoom: xfRef.current.zoom / fitRef.current.zoom });
      }
    },
    onPanResponderTerminate: () => { gest.current = null; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [nx, ny, onTap, setTransform]);

  const box = xf && nx ? { position: 'absolute', left: xf.panX, top: xf.panY, width: nx * xf.zoom, height: ny * xf.zoom } : null;

  return (
    <View style={s.viewport} ref={viewRef} onLayout={onLayout} {...responder.panHandlers}>
      {box && imageUri ? (
        // Same component across slices, only the source changes - Spike A's
        // A9 path (cached switch p95 65 ms on the A17, release build).
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
      {box ? layers.filter((l) => l.visible && l.path).map((l) => (
        <Svg
          key={l.key}
          style={box}
          width={box.width}
          height={box.height}
          viewBox={`0 0 ${nx} ${ny}`}
          preserveAspectRatio="none"
          pointerEvents="none"
        >
          <Path d={l.path} fill={l.color} fillOpacity={l.opacity} />
        </Svg>
      )) : null}
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
 * Slice navigation: a slider track plus step buttons (`10` §3 "swipe/slider
 * slice navigation"). The track maps a finger position to a slice through
 * scrubIndex() - the same x always gives the same slice, both ends are
 * reachable (TC-MRI-002). Every change is reported; the screen's serial
 * runner coalesces a fast scrub into "the slice in flight, then the last".
 *
 * React Native core has no Slider, and a dependency for one track is not
 * worth it: a View and a PanResponder are the whole component.
 */

export function SliceScrubber({ index, pending, total, onChange, onLongPressLabel, disabled = false }) {
  const [width, setWidth] = useState(0);
  const last = useRef(null);
  const widthRef = useRef(0);
  const totalRef = useRef(total);
  totalRef.current = total;

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
  const thumb = Number.isInteger(shown) && total ? scrubPosition(shown, width, total) : 0;
  const step = (d) => {
    if (!Number.isInteger(shown) || !total) return;
    const next = Math.max(0, Math.min(total - 1, shown + d));
    if (next !== shown) onChange(next);
  };

  return (
    <View style={scrub.root}>
      <TouchableOpacity onLongPress={onLongPressLabel} delayLongPress={800} activeOpacity={0.8} accessibilityRole="text">
        <Text style={scrub.label}>
          {sliceLabel(index, total)}
          {pending !== null && pending !== undefined && pending !== index ? `   → ${pending + 1} loading…` : ''}
        </Text>
      </TouchableOpacity>
      <View style={scrub.row}>
        <Btn label="−10" onPress={() => step(-10)} disabled={disabled} />
        <Btn label="◀" onPress={() => step(-1)} disabled={disabled} />
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
        <Btn label="▶" onPress={() => step(1)} disabled={disabled} />
        <Btn label="+10" onPress={() => step(10)} disabled={disabled} />
      </View>
    </View>
  );
}

function Btn({ label, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[scrub.btn, disabled && scrub.btnD]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={scrub.btnT}>{label}</Text>
    </TouchableOpacity>
  );
}

const scrub = StyleSheet.create({
  root: { marginTop: space.s },
  label: { color: color.text, fontFamily: font.mono, fontSize: font.body, textAlign: 'center', marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  track: { flex: 1, height: MIN_TOUCH, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: color.border },
  thumb: {
    position: 'absolute', top: (MIN_TOUCH - 20) / 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: color.accent, borderWidth: 2, borderColor: color.text,
  },
  btn: {
    minWidth: 44, minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.border,
    backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  btnD: { opacity: 0.4 },
  btnT: { color: color.text, fontSize: font.body, fontWeight: '700' },
});

/*
 * One mask layer for the viewport: content_url in, vector path out.
 *
 * Goes through the runtime's mask store (runtime.content.bytes -> maskPng.js
 * -> runs), keyed by the content-addressed URL and the slice size the mask
 * must have; the checksum the server stated is verified on the way in. A
 * decode that is already cached is returned in the SAME render (peek), so a
 * revisited slice draws its overlay with its image, not a frame later.
 *
 *   status  'off'      no store (fixture mode) or no URL - nothing to fetch
 *           'loading'  fetching / decoding
 *           'ready'    path is drawable
 *           'error'    the layer is unavailable; `error` says why
 */

const OFF = Object.freeze({ status: 'off', path: null, pixels: null, error: null, url: null });

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
    setState({ status: 'loading', path: null, pixels: null, error: null, url });
    store.load(url, expected, { checksum }).then(
      (v) => { if (alive) setState({ status: 'ready', path: v.path, pixels: v.pixels, error: null, url }); },
      (err) => { if (alive) setState({ status: 'error', path: null, pixels: null, error: String(err && err.message), url }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, url, width, height, checksum]);

  if (cached) return { status: 'ready', path: cached.path, pixels: cached.pixels, error: null, url };
  // Never hand back a path that belongs to a previous URL.
  if (state.url !== url) return url && store && expected ? { status: 'loading', path: null, pixels: null, error: null, url } : OFF;
  return state;
}
