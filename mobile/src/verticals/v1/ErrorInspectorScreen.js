/*
 * SCR-04 - Error Inspector (V1, Phạm Tuấn Anh, DR-013a; built under the Day 22
 * override, revalidated by the owner on D23).
 *
 * `10` §3 / §7 and the DEMO_STANDARD §4 bar:
 *   available only with ground truth   an INFERENCE_REVIEW case (or a run whose
 *                                      metrics answer GROUND_TRUTH_UNAVAILABLE)
 *                                      gets a clear unavailable state - never an
 *                                      empty chart that reads as "no error"
 *                                      (PR-MODE-01, TC-MODE-001)
 *   prediction vs ground truth         TP / FP / FN drawn from the two masks the
 *                                      server served for this slice, each class
 *                                      with a colour AND a name, a count and an
 *                                      on/off switch (TC-ERR-001, TC-ERR-002)
 *   per-slice metrics / error amounts  the server's per-slice Dice and the
 *                                      DR-010 selection's FP / FN per eligible
 *                                      slice, as a profile across the volume
 *   jump to the worst slice            the server's worst_slice_selection
 *                                      (analysis_run_metrics, DR-010a option b),
 *                                      first entry first - never ranked here
 *   entry to 3D error view             SCR-05 with the slice and variant
 *
 * Slice data comes from the same V1 model as SCR-03; bytes from
 * runtime.content through the mask store (checksum-verified); every slice
 * switch is a CMW_GESTURE line like SCR-03's.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { emptyUnavailable, RECOVERY, readSelection, STATE } from '../../../../app/core/index.mjs';
import { createCaseExplorer } from '../../../../app/verticals/v1_case_explorer/index.mjs';
import { disagreementRuns, runsToPath } from '../../imaging/maskPaths.mjs';
import useCall from '../../runtime/useCall';
import StateView, { StatePanel } from '../../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import CapabilityBadge from './CapabilityBadge';
import SliceScrubber from './SliceScrubber';
import SliceViewport from './SliceViewport';
import { capabilityOf } from './capability.mjs';
import {
  CLASS_ORDER, ERROR_CLASS, compareWithServer, fmt, profileFromSelection, profileIndexAt, readRunMetrics,
  topEntries, worstLabel,
} from './errorInspector.mjs';
import { metricsText } from './explorer.mjs';
import { createSerialRunner } from './serialRunner.mjs';

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
    // PR-MODE-01: no ground truth, no error view - said plainly, nothing drawn.
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

  // Run level: case metrics and the server's worst-slice selection.
  const metricsCall = useCall(runtime.client, 'analysis_run_metrics', { run_id: runId, variant });
  const runMetrics = metricsCall.view.state === STATE.SUCCESS ? readRunMetrics(metricsCall.view.data) : null;
  const selection = useMemo(
    () => readSelection(metricsCall.view.state === STATE.SUCCESS ? metricsCall.view.data : null),
    [metricsCall.view],
  );
  const profile = useMemo(() => profileFromSelection(selection, total), [selection, total]);
  const worst = topEntries(selection, 5);

  // Slice level: the V1 model, one action at a time, newest slice wins.
  const model = useMemo(() => createCaseExplorer(client, { variant }), [client, variant]);
  const [current, setCurrent] = useState(model.current);
  const [shown, setShown] = useState(null);
  const [displayed, setDisplayed] = useState(null);
  const [pending, setPending] = useState(null);
  const [visible, setVisible] = useState({ TP: true, FP: true, FN: true });
  const [opacity, setOpacity] = useState(0.6);
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
    // Same cache rules as SCR-03 (#77 QA N-1/N-2): a fresh open does not trust
    // a cached "unavailable" answer; a Retry forgets only the slice it retries.
    if (client.clearNegative) client.clearNegative();
    if (net) net.begin({ caseId, from: null, to: start, kind: 'open' });
    runner.run(() => model.open({ caseId, runId, sliceIndex: start }));
  }, [runner, model, net, client, caseId, runId, start]);

  const retrySlice = useCallback(() => {
    const zz = model.current.sliceIndex;
    if (client.clearNegative) client.clearNegative();
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

  // ----- what is on screen ---------------------------------------------------------
  const ok = displayed !== null;
  const state = current.view.state;
  const blocking = state !== STATE.SUCCESS && !(state === STATE.LOADING && ok);
  // As in SCR-03 (#77 QA B-3): while the viewer shows a state, nothing of the
  // slice displayed before - classes, counts, comparison, ids, metric - stays
  // on screen as if it were this one.
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

  const layers = classes && classes.paths
    ? CLASS_ORDER.map((k) => ({ key: k, path: classes.paths[k], color: ERROR_CLASS[k].color, opacity, visible: visible[k] }))
    : [];
  const serverCell = showing && profile.cells.length ? profile.cells[z] : null;
  const check = classes && classes.counts ? compareWithServer(serverCell, classes.counts) : null;

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
            <StatePanel view={current.view} what={`slice ${(current.sliceIndex ?? 0) + 1}`} onAction={(id) => { if (id === RECOVERY.BACK) nav.pop(); else retrySlice(); }} />
          </View>
        ) : (
          <SliceViewport
            shape={shape}
            imageUri={mriImage ? mriImage.uri : null}
            layers={layers}
            placeholderNote={pixelNote}
            resetKey={caseId}
          />
        )}
      </View>

      <SliceScrubber index={blocking ? current.sliceIndex : (ok ? z : current.sliceIndex)} pending={pending} total={total} onChange={goTo} />

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
              <View style={[s.swatch, { backgroundColor: ERROR_CLASS[k].color }, !visible[k] && s.swatchOff]} />
              <View style={s.legendText}>
                <Text style={s.legendLabel}>
                  {ERROR_CLASS[k].label}{classes && classes.counts ? ` · ${classes.counts[k.toLowerCase()]} px` : ''}{visible[k] ? '' : ' (hidden)'}
                </Text>
                <Text style={s.dim}>{ERROR_CLASS[k].detail}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={s.opacityRow}>
            <Text style={s.dim}>Opacity</Text>
            {[0.4, 0.6, 0.8, 1].map((o) => (
              <TouchableOpacity key={o} style={[s.step, opacity === o && s.stepOn]} onPress={() => setOpacity(o)} accessibilityRole="button">
                <Text style={[s.stepT, opacity === o && s.stepTOn]}>{Math.round(o * 100)}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.dim}>Counted from the two masks drawn here; tap a class to hide or show it.</Text>
          {check && check.checked && <Text style={check.consistent ? s.ok : s.warn}>{check.text}</Text>}
          <Text style={s.mono}>reference {short(showing && displayed.groundTruthRef ? displayed.groundTruthRef.artifactId : null)} · prediction {short(showing && displayed.predictionRef ? displayed.predictionRef.artifactId : null)}</Text>
          <Text style={[s.metric, metricsLine.tone === 'ok' && s.ok]}>{metricsLine.text}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardH}>Worst slices (server, DR-010)</Text>
          {metricsCall.view.state !== STATE.SUCCESS ? (
            <StatePanel view={metricsCall.view} what="the run metrics" compact onAction={(id) => (id === RECOVERY.BACK ? nav.pop() : metricsCall.refetch())} />
          ) : !selection.available ? (
            <Text style={s.dim}>
              {selection.reason === 'SELECTION_NO_ELIGIBLE_SLICES'
                ? 'No slice has non-empty ground truth, so there is no worst slice to rank.'
                : 'The server did not return a worst-slice selection for this run.'}
            </Text>
          ) : (
            <>
              <Text style={s.dim}>{selection.ruleId} · {selection.selectionVersion || 'version not stated'} · in the order the server ranked them</Text>
              {worst.map((e, i) => (
                <TouchableOpacity
                  key={e.sliceIndex}
                  style={[s.worst, i === 0 && s.worstFirst]}
                  onPress={() => goTo(e.sliceIndex)}
                  accessibilityRole="button"
                  accessibilityLabel={`Jump to ${worstLabel(e)}`}
                >
                  <Text style={[s.worstT, i === 0 && s.worstTFirst]}>{i === 0 ? 'Jump to worst · ' : `#${i + 1} · `}{worstLabel(e)}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardH}>Error profile across the volume (server: FP + FN per eligible slice)</Text>
          <ProfileChart profile={profile} current={showing ? z : null} total={total} onPick={goTo} available={selection.available} />
          <Text style={s.dim}>Bar = FP + FN pixels the server counted on that slice. No bar = not eligible (no ground truth there) - not zero. Tap to open a slice.</Text>
          {profile.problems.map((p) => <Text key={p} style={s.warn}>{p}</Text>)}
        </View>

        {runMetrics && (
          <View style={s.card}>
            <Text style={s.cardH}>Case metrics (server, {runMetrics.aggregation || 'aggregation not stated'})</Text>
            <Text style={s.metric}>Dice {fmt(runMetrics.dice)} · IoU {fmt(runMetrics.iou)}</Text>
            <Text style={s.metric}>FP {fmt(runMetrics.falsePositives)} · FN {fmt(runMetrics.falseNegatives)} voxels · RVE {fmt(runMetrics.relativeVolumeError, 1)} %</Text>
            <Text style={s.dim}>{runMetrics.variant || variant} · metric {runMetrics.version || 'not stated'} · state {runMetrics.state || 'not stated'}</Text>
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

function ProfileChart({ profile, current, total, onPick, available }) {
  const [w, setW] = useState(0);
  const H = 64;
  if (!available || !Number.isInteger(total) || total <= 0) {
    return <Text style={s.dim}>No profile: the server returned no per-slice selection for this run.</Text>;
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
  swatch: { width: 20, height: 20, borderRadius: 4 },
  swatchOff: { opacity: 0.25 },
  opacityRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  step: {
    minHeight: 40, minWidth: 52, borderRadius: 6, borderWidth: 1, borderColor: color.border,
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
  mono: { color: color.textDim, fontFamily: font.mono, fontSize: 11 },
});
