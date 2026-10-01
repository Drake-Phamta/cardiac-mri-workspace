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
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { clampZoom, fitTransform, panBy, screenToSource, zoomAbout } from '../../../../app/core/index.mjs';
import { color, font, space } from '../../ui/theme';

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
