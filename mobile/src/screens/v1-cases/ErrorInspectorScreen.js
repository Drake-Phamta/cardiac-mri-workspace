/*
 * SCR-04 Error Inspector: TP / FP / FN of the prediction against ground truth on one slice, the server's worst
 * slices and error profile, and the case metrics. Slice data comes from the same model as SCR-03; the run-level
 * rules are in errorInspector.mjs. A case without ground truth gets an "unavailable" state, never an empty chart.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { emptyUnavailable, RECOVERY, STATE } from '../../api/states.mjs';
import { createCaseExplorer, metricsText, createSerialRunner } from './cases.mjs';
import {
  disagreementMasks, disagreementRuns, maskOutlinePath, runsToPath,
} from '../../lib/mask.mjs';
import { useCall } from '../../api/RuntimeContext';
import StateView, { StatePanel } from '../../components/StateView';
import { color, font, MIN_TOUCH, space } from '../../components/theme';
import CapabilityBadge from '../../components/CapabilityBadge';
import Provenance, { IdLine } from '../../components/Provenance';
import SliceViewport, { OverlayStyleChips, SliceScrubber, useSlicePlayer } from './SliceView';
import {
  OVERLAY_MODE, needsOutline, rememberedOverlayStyle, rememberOverlayStyle,
} from './sliceControls.mjs';
import { capabilityOf } from '../../lib/caseMode.mjs';
import {
  CLASS_ORDER, ERROR_CLASS, compareMaskIds, compareWithServer, fmt, inVolume, outsideVolumeNote, pinnedSelection,
  profileIndexAt, profileNote, runLevel, selectionNote, worstLabel,
} from './errorInspector.mjs';

const short = (s) => (typeof s === 'string' && s.length > 26 ? `${s.slice(0, 25)}…` : (s ?? '-'));

export default function ErrorInspectorScreen({ runtime, nav, params }) {
  const { caseId, runId, variant } = params;
  const caseCall = useCall(runtime.client, 'case_get', { case_id: caseId });

  const onAction = useCallback((id) => {
    if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) caseCall.refetch();
    else nav.pop();
  }, [caseCall, nav]);

  if (caseCall.view.state !== STATE.SUCCESS) {
    return <StateView view={caseCall.view} what={`case ${caseId}`} onAction={onAction} />;
  }
  const kase = caseCall.view.data;
  const capability = capabilityOf(kase.mode, kase.ground_truth_available);
  if (!capability.groundTruthUsable) {
    // No ground truth, no error view: an empty chart would read as "no error".
    return (
      <View style={s.center}>
        <View style={s.caseRow}>
          <Text style={s.caseId}>{caseId}</Text>
          <CapabilityBadge capability={capability} />
        </View>
        <StatePanel view={emptyUnavailable('GROUND_TRUTH_UNAVAILABLE', [RECOVERY.BACK])} what="the error view" onAction={() => nav.pop()} />
        <Text style={s.dim}>
          The Error Inspector compares the prediction with ground truth. This case has none ({capability.label}), so
          there is no disagreement, metric or worst slice to show - not zero.
        </Text>
      </View>
    );
  }
  return (
    <ErrorView
      runtime={runtime}
      nav={nav}
      caseId={caseId}
      runId={runId}
      variant={variant}
      kase={kase}
      capability={capability}
      initialSlice={params.sliceIndex}
    />
  );
}

function ErrorView({ runtime, nav, caseId, runId, variant, kase, capability, initialSlice }) {
  const client = runtime.sliceClient || runtime.client;
  const net = runtime.netLog || null;
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;
  const width = shape ? shape[0] : null;
  const height = shape ? shape[1] : null;
  const size = useMemo(() => (width && height ? { width, height } : null), [width, height]);

  // Run level: case metrics and the server's worst slices, shown only for the variant asked for and the rule and
  // selection version the contract pins (see runLevel).
  const metricsCall = useCall(runtime.client, 'analysis_run_metrics', { run_id: runId, variant });
  const pinned = useMemo(() => pinnedSelection(runtime.contract), [runtime.contract]);
  const run = useMemo(
    () => runLevel(metricsCall.view, { variant, pinned, total }),
    [metricsCall.view, variant, pinned, total],
  );
  const { metrics: runMetrics, selection, profile, worst } = run;
  const selNote = selectionNote(selection);

  // Slice level: the case explorer model, one action at a time, newest slice wins.
  const model = useMemo(() => createCaseExplorer(client, { variant }), [client, variant]);
  const [current, setCurrent] = useState(model.current);
  const [shown, setShown] = useState(null);
  const [displayed, setDisplayed] = useState(null);
  const [pending, setPending] = useState(null);
  const [visible, setVisible] = useState({ TP: true, FP: true, FN: true });
  const [opacity, setOpacity] = useState(0.6);
  // Both by default: the fill shows the area, the outline its edge (FP dashed), so a class never relies on colour.
  const [style, setStyle] = useState(() => rememberedOverlayStyle('SCR-04', { mode: OVERLAY_MODE.BOTH, width: 2 }));
  const changeStyle = useCallback((patch) => setStyle((st) => {
    const next = { ...st, ...patch };
    rememberOverlayStyle('SCR-04', next);
    return next;
  }), []);
  const displayedRef = useRef(null);

  const settle = useCallback(() => {
    const c = model.current;
    setCurrent(c);
    if (c.view.state === STATE.SUCCESS) setShown(c);
    else if (c.view.state !== STATE.LOADING && net && net.openSeq !== null) net.end({ outcome: c.view.state });
  }, [model, net]);
  const runner = useMemo(() => createSerialRunner({
    onSettled: ({ idle }) => { settle(); if (idle) setPending(null); },
    onError: () => settle(),
  }), [settle]);
  useEffect(() => () => runner.dispose(), [runner]);

  const start = Number.isInteger(initialSlice) ? initialSlice : (Number.isInteger(total) ? Math.floor(total / 2) : 0);
  useEffect(() => {
    // Same cache rules as SCR-03: only a fresh open drops cached "unavailable" answers; Retry forgets one slice.
    if (client.clearNegative) client.clearNegative();
    if (net) net.begin({ caseId, from: null, to: start, kind: 'open' });
    runner.run(() => model.open({ caseId, runId, sliceIndex: start }));
  }, [runner, model, net, client, caseId, runId, start]);

  const retrySlice = useCallback(() => {
    const zz = model.current.sliceIndex;
    if (client.clearWhere && Number.isInteger(zz)) {
      client.clearWhere((_ep, p) => p.slice_index === zz && (p.case_id === caseId || p.run_id === runId));
    }
    if (net && Number.isInteger(zz)) net.begin({ caseId, from: zz, to: zz, kind: 'refresh' });
    runner.run(() => model.refresh());
  }, [caseId, client, model, net, runId, runner]);

  const goTo = useCallback((n) => {
    if (!Number.isInteger(n) || !Number.isInteger(total)) return;
    const z = Math.max(0, Math.min(total - 1, n));
    setPending(z);
    if (net) net.begin({ caseId, from: displayedRef.current ? displayedRef.current.sliceIndex : null, to: z, kind: 'slice' });
    runner.run(() => model.goToSlice(z), { key: 'slice' });
  }, [caseId, model, net, runner, total]);

  // Both masks (and the MRI) in hand before the slice is displayed.
  useEffect(() => {
    if (!shown) return undefined;
    let alive = true;
    const jobs = [];
    const ref = (r) => (r && r.contentUrl ? r : null);
    const mri = ref(shown.imageRef);
    const pred = ref(shown.predictionRef);
    const gt = ref(shown.groundTruthRef);
    if (mri && runtime.imageStore) jobs.push(runtime.imageStore.load(mri.contentUrl, { checksum: mri.checksum }).catch(() => null));
    if (pred && runtime.maskStore && size) jobs.push(runtime.maskStore.load(pred.contentUrl, size, { checksum: pred.checksum }).catch((e) => ({ error: e })));
    if (gt && runtime.maskStore && size) jobs.push(runtime.maskStore.load(gt.contentUrl, size, { checksum: gt.checksum }).catch((e) => ({ error: e })));
    Promise.all(jobs).then(() => {
      if (!alive) return;
      displayedRef.current = shown;
      setDisplayed(shown);
      if (net && net.openSeq !== null && net.openTo === shown.sliceIndex) net.end({ outcome: 'shown' });
    });
    return () => { alive = false; };
  }, [shown, runtime.imageStore, runtime.maskStore, size, net]);

  const ok = displayed !== null;
  const state = current.view.state;
  const blocking = state !== STATE.SUCCESS && !(state === STATE.LOADING && ok);
  // Play sweeps the slices with their error classes; the user's own slice actions (userGoTo, Retry) stop it.
  const player = useSlicePlayer({ total, goTo, displayed, failed: blocking });
  const userGoTo = (n) => { player.stop(); goTo(n); };
  // As in SCR-03: while the viewer shows a state, nothing from the previous slice stays on screen.
  const showing = ok && !blocking;
  const z = ok ? displayed.sliceIndex : null;
  const peekMask = (r) => (r && r.contentUrl && runtime.maskStore && size ? runtime.maskStore.peek(r.contentUrl, size) : null);
  const predMask = showing ? peekMask(displayed.predictionRef) : null;
  const gtMask = showing ? peekMask(displayed.groundTruthRef) : null;
  const mriImage = ok && displayed.imageRef && displayed.imageRef.contentUrl && runtime.imageStore
    ? runtime.imageStore.peek(displayed.imageRef.contentUrl) : null;

  const classes = useMemo(() => {
    if (!predMask || !gtMask) return null;
    try {
      const d = disagreementRuns(gtMask.mask, predMask.mask);
      return { counts: d.counts, paths: { TP: runsToPath(d.tp), FP: runsToPath(d.fp), FN: runsToPath(d.fn) }, error: null };
    } catch (err) {
      return { counts: null, paths: null, error: String(err && err.message) };
    }
  }, [predMask, gtMask]);

  // Each class's outline, traced from its own mask only while an outline is shown.
  const outlined = needsOutline(style.mode);
  const classOutlines = useMemo(() => {
    if (!outlined || !predMask || !gtMask || !classes || classes.error) return null;
    const m = disagreementMasks(gtMask.mask, predMask.mask);
    return { TP: maskOutlinePath(m.tp), FP: maskOutlinePath(m.fp), FN: maskOutlinePath(m.fn) };
  }, [outlined, predMask, gtMask, classes]);

  const layers = classes && classes.paths
    ? CLASS_ORDER.map((k) => ({
      key: k,
      path: classes.paths[k],
      outline: classOutlines ? classOutlines[k] : null,
      color: ERROR_CLASS[k].color,
      dashed: ERROR_CLASS[k].dashed === true,
      opacity,
      visible: visible[k],
    }))
    : [];
  const serverCell = showing && profile.cells.length ? profile.cells[z] : null;
  // The server's FP / FN are compared with the drawn classes only when the drawn masks are the ones it names.
  const ids = classes && classes.counts ? compareMaskIds(runMetrics, displayed) : null;
  const idsDiffer = Boolean(ids && ids.checked && !ids.consistent);
  const check = classes && classes.counts && !idsDiffer ? compareWithServer(serverCell, classes.counts) : null;

  let pixelNote = null;
  if (runtime.mode === 'fixture') pixelNote = 'Fixture mode: no pixels behind any URL, so no disagreement can be drawn. The numbers below are the server\'s.';
  else if (ok && (!displayed.predictionRef || !displayed.groundTruthRef)) pixelNote = 'This slice has no prediction or no ground-truth mask from the server: no disagreement to draw.';
  else if (ok && (!predMask || !gtMask)) pixelNote = 'A mask for this slice could not be fetched or decoded; the classes are not drawn.';
  else if (classes && classes.error) pixelNote = `The two masks cannot be compared: ${classes.error}`;

  const metricsLine = showing ? metricsText(displayed.metrics, displayed.variant) : { text: 'Slice Dice: -', tone: 'neutral' };

  return (
    <View style={s.root}>
      <View style={s.head}>
        <View style={s.caseRow}>
          <Text style={s.caseId}>{caseId}</Text>
          <CapabilityBadge capability={capability} />
        </View>
        <Text style={s.sub}>Prediction {variant} vs ground truth · run {runId}</Text>
      </View>

      <View style={s.viewerBox}>
        {blocking ? (
          <View style={s.blocked}>
            <StatePanel view={current.view} what={`slice ${(current.sliceIndex ?? 0) + 1}`} onAction={(id) => { if (id === RECOVERY.BACK) nav.pop(); else { player.stop(); retrySlice(); } }} />
          </View>
        ) : (
          <SliceViewport
            shape={shape}
            imageUri={mriImage ? mriImage.uri : null}
            layers={layers}
            placeholderNote={pixelNote}
            resetKey={caseId}
            overlayMode={style.mode}
            outlineWidth={style.width}
          />
        )}
      </View>

      <SliceScrubber index={blocking ? current.sliceIndex : (ok ? z : current.sliceIndex)} pending={pending} total={total} onChange={userGoTo}
        playing={player.playing} onPlay={player.toggle} />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollIn}>
        {pixelNote && !blocking ? <Text style={s.dim}>{pixelNote}</Text> : null}

        <View style={s.card}>
          <Text style={s.cardH}>Legend - this slice ({showing ? `z ${z}` : '-'})</Text>
          {CLASS_ORDER.map((k) => (
            <TouchableOpacity
              key={k}
              style={s.legendRow}
              onPress={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              accessibilityRole="switch"
              accessibilityState={{ checked: visible[k] }}
              accessibilityLabel={`${ERROR_CLASS[k].label}, ${visible[k] ? 'shown' : 'hidden'}`}
            >
              <View
                style={[
                  s.swatch,
                  { borderColor: ERROR_CLASS[k].color, backgroundColor: `${ERROR_CLASS[k].color}66` },
                  ERROR_CLASS[k].dashed && s.swatchDashed,
                  !visible[k] && s.swatchOff,
                ]}
              />
              <View style={s.legendText}>
                <Text style={s.legendLabel}>
                  {ERROR_CLASS[k].label}{classes && classes.counts ? ` · ${classes.counts[k.toLowerCase()]} px` : ''}{visible[k] ? '' : ' (hidden)'}
                </Text>
                <Text style={s.dim}>{ERROR_CLASS[k].detail}{outlined ? ` · ${ERROR_CLASS[k].dashed ? 'dashed' : 'solid'} edge` : ''}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <OverlayStyleChips
            mode={style.mode}
            width={style.width}
            onMode={(mode) => changeStyle({ mode })}
            onWidth={(width) => changeStyle({ width })}
          />
          <View style={s.opacityRow}>
            <Text style={s.rowLabel}>{style.mode === OVERLAY_MODE.OUTLINE ? 'Fill (off)' : 'Fill'}</Text>
            {[0.4, 0.6, 0.8, 1].map((o) => (
              <TouchableOpacity key={o} style={[s.step, opacity === o && s.stepOn]} onPress={() => setOpacity(o)} accessibilityRole="button">
                <Text style={[s.stepT, opacity === o && s.stepTOn]}>{Math.round(o * 100)}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.dim}>Counted from the two masks drawn here; tap a class to hide or show it.</Text>
          {idsDiffer && <Text style={s.warn}>{ids.text}</Text>}
          {check && check.checked && <Text style={check.consistent ? s.ok : s.warn}>{check.text}</Text>}
          <Text style={[s.metric, metricsLine.tone === 'ok' && s.ok]}>{metricsLine.text}</Text>
        </View>

        <Provenance title="Provenance (this slice)" summary="the mask ids the classes were counted from">
          <IdLine>reference {short(showing && displayed.groundTruthRef ? displayed.groundTruthRef.artifactId : null)} · prediction {short(showing && displayed.predictionRef ? displayed.predictionRef.artifactId : null)}</IdLine>
        </Provenance>

        <View style={s.card}>
          <Text style={s.cardH}>Worst slices (server, {pinned.ruleId || 'no rule pinned by the contract'})</Text>
          {run.view.state !== STATE.SUCCESS ? (
            <StatePanel view={run.view} what="the run metrics" compact onAction={(id) => (id === RECOVERY.BACK ? nav.pop() : metricsCall.refetch())} />
          ) : !selection.available ? (
            <Text style={selNote.tone === 'warn' ? s.warn : s.dim}>{selNote.text}</Text>
          ) : (
            <>
              <Text style={s.dim}>{selection.ruleId} · {selection.selectionVersion} · in the order the server ranked them</Text>
              {worst.map((e, i) => {
                // An entry outside the volume is listed but not opened: goTo would clamp it to the edge slice.
                const opens = inVolume(e, total);
                const away = outsideVolumeNote(e, total);
                return (
                  <TouchableOpacity
                    key={e.sliceIndex}
                    style={[s.worst, i === 0 && s.worstFirst, !opens && s.worstOff]}
                    onPress={() => { if (opens) userGoTo(e.sliceIndex); }}
                    disabled={!opens}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !opens }}
                    accessibilityLabel={opens ? `Jump to ${worstLabel(e)}` : `${worstLabel(e)}, ${away}`}
                  >
                    <Text style={[s.worstT, i === 0 && s.worstTFirst]}>
                      {i === 0 ? (opens ? 'Jump to worst · ' : 'Worst · ') : `#${i + 1} · `}{worstLabel(e)}
                    </Text>
                    {away ? <Text style={s.warn}>{away}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardH}>Error profile across the volume (server: FP + FN per eligible slice)</Text>
          <ProfileChart profile={profile} current={showing ? z : null} total={total} onPick={userGoTo} note={profileNote(run)} />
          <Text style={s.dim}>Bar = FP + FN pixels the server counted on that slice. No bar = not eligible (no ground truth there) - not zero. Tap to open a slice.</Text>
          {profile.problems.map((p) => <Text key={p} style={s.warn}>{p}</Text>)}
        </View>

        {runMetrics && (
          <View style={s.card}>
            <Text style={s.cardH}>Case metrics (server, {runMetrics.aggregation || 'aggregation not stated'})</Text>
            <Text style={s.metric}>Dice {fmt(runMetrics.dice)} · IoU {fmt(runMetrics.iou)}</Text>
            <Text style={s.metric}>FP {fmt(runMetrics.falsePositives)} · FN {fmt(runMetrics.falseNegatives)} voxels · RVE {fmt(runMetrics.relativeVolumeError, 1)} %</Text>
            <Text style={s.dim}>{runMetrics.variant} · metric {runMetrics.version || 'not stated'} · state {runMetrics.state || 'not stated'}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.entry, blocking && s.entryOff]}
          onPress={() => nav.push('SCR-05', { caseId, runId, sliceIndex: z ?? start, variant, view: 'error' })}
          disabled={blocking}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocking }}
        >
          <Text style={s.entryT}>3D error view (SCR-05)</Text>
          {blocking ? <Text style={s.dim}>this slice did not load</Text> : null}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ProfileChart({ profile, current, total, onPick, note }) {
  const [w, setW] = useState(0);
  const H = 64;
  // Same gate as the worst-slice list: no selection shown, no profile drawn.
  if (note) return <Text style={s.dim}>{note}</Text>;
  if (!Number.isInteger(total) || total <= 0) {
    return <Text style={s.dim}>No profile: the case states no slice count.</Text>;
  }
  const max = profile.maxError > 0 ? profile.maxError : 1;
  const bw = w > 0 ? w / total : 0;
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={(e) => { const i = profileIndexAt(e.nativeEvent.locationX, w, total); if (i !== null) onPick(i); }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={s.chart}
      accessibilityRole="adjustable"
      accessibilityLabel="Error profile across the volume"
    >
      {w > 0 && (
        <Svg width={w} height={H}>
          {profile.cells.map((c, i) => (c ? (
            <Rect
              key={i}
              x={i * bw}
              y={H - Math.max(2, (c.errorPixels ?? 0) / max * (H - 4))}
              width={Math.max(1, bw - 1)}
              height={Math.max(2, (c.errorPixels ?? 0) / max * (H - 4))}
              fill={c.rank === 0 ? ERROR_CLASS.FP.color : color.textDim}
            />
          ) : null))}
          {Number.isInteger(current) && <Rect x={current * bw} y={0} width={Math.max(2, bw)} height={H} fill="none" stroke={color.accent} strokeWidth={2} />}
        </Svg>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.m, paddingTop: space.s },
  center: { flex: 1, justifyContent: 'center', padding: space.l, gap: space.m },
  head: { gap: 2, marginBottom: space.s },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  caseId: { color: color.text, fontFamily: font.mono, fontSize: font.h2, fontWeight: '700' },
  sub: { color: color.textDim, fontSize: font.small },
  viewerBox: { width: '100%', aspectRatio: 1 },
  blocked: { flex: 1, justifyContent: 'center' },
  scroll: { flex: 1, marginTop: space.xs },
  scrollIn: { paddingBottom: space.xl, gap: space.s },
  card: { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 10, padding: space.m, gap: space.xs },
  cardH: { color: color.textDim, fontSize: font.small, fontWeight: '700', letterSpacing: 0.5 },
  legendRow: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.s },
  legendText: { flex: 1 },
  legendLabel: { color: color.text, fontSize: font.body, fontWeight: '600' },
  swatch: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderStyle: 'solid' },
  swatchDashed: { borderStyle: 'dashed' },
  swatchOff: { opacity: 0.25 },
  opacityRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  rowLabel: { color: color.textDim, fontSize: font.small, minWidth: 52 },
  step: {
    minHeight: MIN_TOUCH, minWidth: 52, borderRadius: 6, borderWidth: 1, borderColor: color.control,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceHi,
  },
  stepOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  stepT: { color: color.textDim, fontSize: font.small, fontWeight: '600' },
  stepTOn: { color: color.accent },
  worst: {
    minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.border, backgroundColor: color.surfaceHi,
    paddingHorizontal: space.m, justifyContent: 'center',
  },
  worstFirst: { borderColor: ERROR_CLASS.FP.color },
  worstOff: { borderColor: color.warn, opacity: 0.7 },
  worstT: { color: color.text, fontFamily: font.mono, fontSize: font.small },
  worstTFirst: { color: ERROR_CLASS.FP.color, fontWeight: '700' },
  chart: { height: 64, width: '100%', backgroundColor: color.bg, borderRadius: 6 },
  metric: { color: color.text, fontSize: font.body },
  entry: {
    minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.accent, backgroundColor: color.accentBg,
    paddingHorizontal: space.m, justifyContent: 'center',
  },
  entryOff: { opacity: 0.5 },
  entryT: { color: color.accent, fontSize: font.body, fontWeight: '700' },
  ok: { color: color.ok, fontSize: font.small },
  warn: { color: color.warn, fontSize: font.small },
  dim: { color: color.textDim, fontSize: font.small },
});
