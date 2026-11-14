/*
 * The 2D slice view shared by SCR-03 and SCR-04: the viewport (MRI image, mask overlays as fill, outline or both,
 * pinch-zoom, pan, tap to source pixel, double tap), the slice readout, the slider and transport, the draw-mode
 * toolbar, and the hook that turns a mask URL into an overlay path. Direction A: the controls float over the image
 * on glass (Floating.js) and use the shared icons.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { clampZoom, fitTransform, panBy, screenToSource, zoomAbout } from '../../lib/viewMath.mjs';
import { maskOutlinePath } from '../../lib/mask.mjs';
import { sliceParts } from '../../lib/sliceNumber.mjs';
import { FloatingToolbar, ToolButton } from '../../components/Floating';
import {
  IconBoth, IconFill, IconForward10, IconOutline, IconPause, IconPlay, IconReplay10, IconStepBack, IconStepForward,
} from '../../components/icons';
import { color, MIN_TOUCH, space, type } from '../../components/theme';
import { scrubIndex, scrubPosition } from './cases.mjs';
import {
  createPlayer, createRepeater, doubleTapTransform, framing, isDoubleTap, OVERLAY_MODE, OVERLAY_MODES, overlayStyle,
  viewerFrame, zoomReadout,
} from './sliceControls.mjs';

const TAP_MAX_TRAVEL = 6;
const TAP_MAX_MS = 400;
const now = () => (global.performance ? global.performance.now() : Date.now());

function Grid({ nx, ny }) {
  const step = 64;
  const lines = [];
  for (let x = step; x < nx; x += step) lines.push(<Line key={`x${x}`} x1={x} y1={0} x2={x} y2={ny} stroke={color.hair} strokeWidth={1} />);
  for (let y = step; y < ny; y += step) lines.push(<Line key={`y${y}`} x1={0} y1={y} x2={nx} y2={y} stroke={color.hair} strokeWidth={1} />);
  return (
    <>
      <Rect x={0} y={0} width={nx} height={ny} fill={color.bg} stroke={color.tick} strokeWidth={2} />
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
 * `fill` makes it full-bleed (SCR-03): it fills its parent, `insets` say how much of the top and bottom the floating
 * bar and panel cover, and it opens at `initialZoom` x fit centred in the uncovered band. Without `fill` it is the
 * square box SCR-04 uses.
 * The image is double-buffered (B1, sliceControls.mjs viewerFrame): a new slice loads under the one on screen, and
 * the old image and its overlays stay up until it has loaded, so Play never shows a black frame.
 */
export default function SliceViewport({
  shape, imageUri, onImageLoad, onImageError, layers = [], placeholderNote = null, resetKey, onTap,
  overlayMode = OVERLAY_MODE.FILL, outlineWidth = 2, fill = false, insets = null, initialZoom = 1, zoomLabelStyle = null,
}) {
  const nx = shape ? shape[0] : null;
  const ny = shape ? shape[1] : null;
  const [xf, setXf] = useState(null);
  const xfRef = useRef(null);
  const fitRef = useRef(null);
  const startRef = useRef(null);
  const viewRef = useRef(null);
  const origin = useRef({ x: 0, y: 0 });
  const size = useRef(null);
  const gest = useRef(null);
  const lastTap = useRef(null);
  const insetTop = insets ? insets.top || 0 : 0;
  const insetBottom = insets ? insets.bottom || 0 : 0;

  const setTransform = useCallback((t) => { xfRef.current = t; setXf(t); }, []);

  const refit = useCallback(() => {
    if (!size.current || !nx || !ny) return;
    if (fill) {
      const f = framing(size.current.w, size.current.h, nx, ny, { top: insetTop, bottom: insetBottom }, initialZoom);
      if (!f) return;
      fitRef.current = f.fit;
      startRef.current = f.start;
      setTransform(f.start);
      return;
    }
    const fit = fitTransform(size.current.w, size.current.h, nx, ny);
    fitRef.current = fit;
    startRef.current = fit;
    setTransform(fit);
  }, [nx, ny, setTransform, fill, insetTop, insetBottom, initialZoom]);

  // A new case (or new geometry) starts at the opening view; a new slice keeps the view.
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

  // B1: the image on screen and the one loading under it.
  const [front, setFront] = useState(null);
  const heldLayers = useRef(layers);
  const frame = viewerFrame(front, imageUri);
  if (!frame.hold) heldLayers.current = layers;
  const drawn = frame.hold ? heldLayers.current : layers;
  useEffect(() => { if (!imageUri) setFront(null); }, [imageUri]);
  const pendingUri = frame.pending;
  const onPendingLoad = useCallback((e) => {
    setFront(pendingUri);
    if (onImageLoad) onImageLoad(e);
  }, [pendingUri, onImageLoad]);
  const onPendingError = useCallback((e) => {
    // A slice that cannot be decoded never leaves the previous slice's picture under its label.
    setFront(null);
    if (onImageError) onImageError(e);
  }, [onImageError]);

  const box = xf && nx ? { position: 'absolute', left: xf.panX, top: xf.panY, width: nx * xf.zoom, height: ny * xf.zoom } : null;
  const zoomText = xf && fitRef.current ? zoomReadout(xf, fitRef.current, fill ? startRef.current : null) : null;

  return (
    <View style={fill ? s.fill : s.viewport} ref={viewRef} onLayout={onLayout} {...responder.panHandlers}>
      {box && pendingUri ? (
        <Image
          key={pendingUri}
          source={{ uri: pendingUri }}
          style={box}
          resizeMode="stretch"
          fadeDuration={0}
          onLoad={onPendingLoad}
          onError={onPendingError}
        />
      ) : null}
      {box && frame.front ? (
        <Image
          key={frame.front}
          source={{ uri: frame.front }}
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
      {box ? drawn.map((l) => {
        const st = overlayStyle({ mode: overlayMode, widthPx: outlineWidth, zoom: xf.zoom, dashed: l.dashed === true, opacity: l.opacity });
        const fillPath = st.fill && l.path ? l.path : null;
        const edge = st.stroke && l.outline ? l.outline : null;
        if (!l.visible || (!fillPath && !edge)) return null;
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
            {fillPath ? <Path d={fillPath} fill={l.color} fillOpacity={st.fillOpacity} /> : null}
            {edge && !l.dashed ? (
              // A black halo under each solid outline keeps it visible on bright tissue (tokens: overlay.halo).
              <Path d={edge} fill="none" stroke="#000000" strokeOpacity={0.5} strokeWidth={st.strokeWidth * 2} strokeLinejoin="round" />
            ) : null}
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
      {!imageUri && placeholderNote && !fill ? (
        <View style={s.noteBox} pointerEvents="none">
          <Text style={s.note}>{placeholderNote}</Text>
        </View>
      ) : null}
      {!shape ? <Text style={s.note}>No geometry yet.</Text> : null}
      {zoomText ? <Text style={[s.zoom, zoomLabelStyle || s.zoomAt]} pointerEvents="none">{zoomText}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  // SCR-04's square: the full width of the screen, edge to edge like the viewer, no frame.
  viewport: { width: '100%', aspectRatio: 1, backgroundColor: color.viewer, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: color.viewer, overflow: 'hidden' },
  noteBox: { position: 'absolute', left: space.l, right: space.l, bottom: space.l, padding: space.s, borderRadius: 6, backgroundColor: color.glass },
  note: { ...type.caption, color: color.t2, textAlign: 'center' },
  zoom: {
    position: 'absolute', ...type.caption, fontWeight: '500', color: color.t1,
    fontVariant: ['tabular-nums'], textShadowColor: '#000000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  zoomAt: { top: space.s, right: space.s },
});

/*
 * The slice readout of the bottom panel: "Slice 45 / 88" (lib/sliceNumber.mjs, 1-based; the z goes to Details).
 * A long press opens the scripted runs (L4, A9) when the screen offers them.
 */
export function SliceReadout({ index, total, onLongPress = null }) {
  const p = sliceParts(index, total);
  const body = (
    <Text style={ro.t} accessibilityLabel={`Slice ${p.current} of ${p.total}`}>
      Slice <Text style={ro.n}>{p.current}</Text> / {p.total}
    </Text>
  );
  if (!onLongPress) return <View style={ro.box} testID="slice-readout">{body}</View>;
  return (
    <TouchableOpacity style={ro.box} onLongPress={onLongPress} delayLongPress={800} activeOpacity={0.8} testID="slice-readout">
      {body}
    </TouchableOpacity>
  );
}

const ro = StyleSheet.create({
  box: { minHeight: MIN_TOUCH, justifyContent: 'center', marginVertical: -8 },
  t: { ...type.secondary, color: color.t2, fontVariant: ['tabular-nums'] },
  n: { ...type.readout, color: color.t1 },
});

/*
 * The slider and the transport of the bottom panel. The slider is a 2 dp track with the slices up to the one shown
 * filled in accent, a tick every 10 slices and a white thumb; scrubIndex() maps a finger x to a slice, so the same x
 * always gives the same slice and both ends are reachable. React Native core has no Slider, so a View and a
 * PanResponder do the job. The transport: back 10, previous (hold to repeat), Play / Pause, next (hold to repeat),
 * forward 10. Every change is reported; the screen's serial runner merges a fast scrub.
 */
export function SliceControls({
  index, pending, total, onChange, disabled = false, playing = false, onPlay = null,
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
  const ticks = [];
  if (width > 0 && Number.isInteger(total) && total > 1) {
    for (let z = 0; z < total; z += 10) ticks.push(z);
    if (ticks[ticks.length - 1] !== total - 1) ticks.push(total - 1);
  }
  const p = sliceParts(index, total);

  return (
    <View>
      <View
        style={sc.track}
        onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); }}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={`Slice ${p.current} of ${p.total}`}
      >
        <View style={sc.rail} pointerEvents="none" />
        {width > 0 && total ? <View style={[sc.railFill, { width: thumb }]} pointerEvents="none" /> : null}
        {ticks.map((z) => (
          <View key={z} style={[sc.tick, { left: Math.min(width - 1, Math.max(0, Math.round(scrubPosition(z, width, total)))) }]} pointerEvents="none" />
        ))}
        {width > 0 && total ? (
          <View style={[sc.thumbRing, { left: thumb - 12 }]} pointerEvents="none">
            <View style={sc.thumb} />
          </View>
        ) : null}
      </View>
      <View style={sc.transport}>
        <StepButton icon={IconReplay10} a11y="Back 10 slices" onPress={() => step(-10)} disabled={disabled} />
        <StepButton icon={IconStepBack} a11y="Previous slice, hold to repeat" onPress={() => step(-1)} disabled={disabled} repeat />
        <TouchableOpacity
          style={[sc.play, (disabled || !onPlay) && sc.off]}
          onPress={onPlay || undefined}
          disabled={disabled || !onPlay}
          accessibilityRole="button"
          accessibilityState={{ selected: playing, disabled: disabled || !onPlay }}
          accessibilityLabel={playing ? 'Pause the slice sweep' : 'Play: sweep through the slices'}
          testID="slice-play"
        >
          {playing ? <IconPause size={26} color={color.bg} /> : <View style={sc.playNudge}><IconPlay size={26} color={color.bg} /></View>}
        </TouchableOpacity>
        <StepButton icon={IconStepForward} a11y="Next slice, hold to repeat" onPress={() => step(1)} disabled={disabled} repeat />
        <StepButton icon={IconForward10} a11y="Forward 10 slices" onPress={() => step(10)} disabled={disabled} />
      </View>
    </View>
  );
}

// A 48 dp transport button. With `repeat`, holding it (after the long-press delay) steps again every
// REPEAT_EVERY_MS until the finger lifts; a short tap is one step.
function StepButton({ icon: Icon, a11y, onPress, disabled, repeat = false }) {
  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const repeater = useMemo(() => createRepeater({ fire: () => pressRef.current() }), []);
  useEffect(() => () => repeater.stop(), [repeater]);
  useEffect(() => { if (disabled) repeater.stop(); }, [disabled, repeater]);
  return (
    <TouchableOpacity
      style={[sc.btn, disabled && sc.off]}
      onPress={onPress}
      onLongPress={repeat ? () => repeater.start() : undefined}
      onPressOut={repeat ? () => repeater.stop() : undefined}
      delayLongPress={350}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Icon size={24} color={color.t1} />
    </TouchableOpacity>
  );
}

const sc = StyleSheet.create({
  // 28 dp in the layout as in the mockup; the touch area is 48 dp (10 dp above and below are negative margins).
  track: { height: MIN_TOUCH, marginVertical: -10, justifyContent: 'center' },
  rail: { height: 2, borderRadius: 1, backgroundColor: color.sliderTrack },
  railFill: { position: 'absolute', left: 0, top: (MIN_TOUCH - 2) / 2, height: 2, borderRadius: 1, backgroundColor: color.accent },
  tick: { position: 'absolute', top: MIN_TOUCH / 2 + 6, width: 1, height: 4, backgroundColor: color.tick },
  thumbRing: {
    position: 'absolute', top: (MIN_TOUCH - 24) / 2, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(90,162,255,0.28)', alignItems: 'center', justifyContent: 'center',
  },
  thumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#ffffff' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, height: 56, marginTop: 8 },
  btn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.t1, alignItems: 'center', justifyContent: 'center' },
  // The triangle's visual centre sits right of its box centre, as in the mockup (margin-left 2).
  playNudge: { marginLeft: 2 },
  off: { opacity: 0.4 },
});

/*
 * The draw-mode toolbar over the image: Fill / Outline / Both, each a 52 dp tool with its icon and name.
 */
const MODE_ICON = Object.freeze({ [OVERLAY_MODE.FILL]: IconFill, [OVERLAY_MODE.OUTLINE]: IconOutline, [OVERLAY_MODE.BOTH]: IconBoth });

export function DrawModeToolbar({ mode, onMode, style }) {
  return (
    <FloatingToolbar style={style} label="Draw masks as">
      {OVERLAY_MODES.map((m) => (
        <ToolButton key={m.key} icon={MODE_ICON[m.key]} label={m.label} selected={mode === m.key} onPress={() => onMode(m.key)} />
      ))}
    </FloatingToolbar>
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
