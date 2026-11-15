/*
 * SCR-04 Error Inspector, in the language of the Direction A viewer: the slice on black with TP / FP / FN drawn over
 * it, the classes as layer chips (FP's swatch dashed, as its edge), the draw-mode toolbar, the slice readout, slider
 * and transport; below them the legend, the server's worst slices (the first one a button), the error profile and
 * the case metrics. Slice data comes from the same model as SCR-03; the run-level rules are in errorInspector.mjs.
 * Mask ids, the run id and the z index go to the Details sheet. A case without ground truth gets an "unavailable"
 * state, never an empty chart.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { emptyUnavailable, RECOVERY, STATE } from '../../api/states.mjs';
import { createCaseExplorer, diceCornerText, metricsText, createSerialRunner, variantLabel } from './cases.mjs';
import {
  disagreementMasks, disagreementRuns, maskOutlinePath, runsToPath,
} from '../../lib/mask.mjs';
import { useCall } from '../../api/RuntimeContext';
import StateView, { StatePanel } from '../../components/StateView';
import { Button, SegmentedControl } from '../../components/Controls';
import { SectionLabel } from '../../components/ListRow';
import MetricStrip from '../../components/MetricStrip';
import { IconEye, IconEyeOff, IconShield } from '../../components/icons';
import { color, HAIRLINE, hitSlopFor, MIN_TOUCH, radius, size, space, type } from '../../components/theme';
import CapabilityBadge from '../../components/CapabilityBadge';
import SliceViewport, { DrawModeToolbar, SliceControls, SliceReadout, useSlicePlayer } from './SliceView';
import { usePrivacyMode } from '../../lib/screenCapture';
import { PRIVACY, privacyText } from '../../lib/privacy.mjs';
import { formatSlice, sliceDetail } from '../../lib/sliceNumber.mjs';
import {
  OUTLINE_WIDTHS, OVERLAY_MODE, needsOutline, rememberedOverlayStyle, rememberOverlayStyle,
} from './sliceControls.mjs';
import { capabilityOf } from '../../lib/caseMode.mjs';
import {
  CLASS_ORDER, ERROR_CLASS, compareMaskIds, compareWithServer, fmt, inVolume, outsideVolumeNote, pinnedSelection,
  profileIndexAt, profileNote, runLevel, selectionNote, worstEntryText,
} from './errorInspector.mjs';

const OPACITY = [0.4, 0.6, 0.8, 1];

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
  const size2d = useMemo(() => (width && height ? { width, height } : null), [width, height]);

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
  // Privacy mode (on by default): screenshots and casting of this screen show black while it is on.
  const privacy = usePrivacyMode('SCR-04');
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
    if (pred && runtime.maskStore && size2d) jobs.push(runtime.maskStore.load(pred.contentUrl, size2d, { checksum: pred.checksum }).catch((e) => ({ error: e })));
    if (gt && runtime.maskStore && size2d) jobs.push(runtime.maskStore.load(gt.contentUrl, size2d, { checksum: gt.checksum }).catch((e) => ({ error: e })));
    Promise.all(jobs).then(() => {
      if (!alive) return;
      displayedRef.current = shown;
      setDisplayed(shown);
      if (net && net.openSeq !== null && net.openTo === shown.sliceIndex) net.end({ outcome: 'shown' });
    });
    return () => { alive = false; };
  }, [shown, runtime.imageStore, runtime.maskStore, size2d, net]);

  const ok = displayed !== null;
  const state = current.view.state;
  const blocking = state !== STATE.SUCCESS && !(state === STATE.LOADING && ok);
  // Play sweeps the slices with their error classes; the user's own slice actions (userGoTo, Retry) stop it.
  const player = useSlicePlayer({ total, goTo, displayed, failed: blocking });
  const userGoTo = useCallback((n) => { player.stop(); goTo(n); }, [player.stop, goTo]);
  // As in SCR-03: while the viewer shows a state, nothing from the previous slice stays on screen.
  const showing = ok && !blocking;
  const z = ok ? displayed.sliceIndex : null;
  const peekMask = (r) => (r && r.contentUrl && runtime.maskStore && size2d ? runtime.maskStore.peek(r.contentUrl, size2d) : null);
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
  const scrubAt = blocking ? current.sliceIndex : (ok ? z : current.sliceIndex);
  const counts = classes && classes.counts ? classes.counts : null;

  // ----- The app bar and the Details sheet (nav.setContext) -----
  const priv = privacyText(privacy.status, privacy.on);
  const actions = useMemo(() => [{
    key: 'privacy', icon: IconShield, label: priv.title, active: privacy.status === PRIVACY.PROTECTED, onPress: privacy.toggle,
  }], [priv.title, privacy.status, privacy.toggle]);
  const ref = (r) => (showing && r ? r.artifactId ?? '-' : '-');
  const detailSections = [
    {
      title: 'This slice',
      lines: [
        sliceDetail(showing ? z : null, total),
        metricsLine.text,
        `reference ${ref(displayed && displayed.groundTruthRef)} · prediction ${ref(displayed && displayed.predictionRef)}`,
      ],
    },
    {
      title: 'Run',
      lines: [
        `Run ${runId} · prediction ${variant} vs ground truth`,
        runMetrics ? `Case metrics: ${runMetrics.variant} · metric ${runMetrics.version || 'not stated'} · state ${runMetrics.state || 'not stated'} · ${runMetrics.aggregation || 'aggregation not stated'}` : null,
        selection.available ? `Worst slices: ${selection.ruleId} · ${selection.selectionVersion}, in the order the server ranked them` : null,
      ].filter(Boolean),
    },
    {
      // Said once, here: the main surface carries no "server ·" labels.
      title: 'Where the numbers come from',
      lines: [
        "Case metrics, worst slices and the error profile are the server's, shown as served. This phone ranks nothing.",
        'The TP, FP and FN pixel counts on the chips and in the legend are counted on this phone from the two masks drawn.',
        'Error profile: a bar is the FP + FN pixels the server counted on that slice. A slice with no bar has no ground truth - that is not zero.',
      ],
    },
    { title: 'Privacy', lines: [priv.title, priv.detail].filter(Boolean) },
  ];
  const detailsKey = JSON.stringify(detailSections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = useMemo(() => detailSections, [detailsKey]);
  // The corner says "vs ground truth"; the app bar keeps to the case and the variant, so it fits beside Live and Info.
  const subtitle = `${caseId} · ${variantLabel(variant)}`;
  useEffect(() => {
    if (typeof nav.setContext !== 'function') return;
    nav.setContext({ subtitle, actions, details });
  }, [nav, subtitle, actions, details]);
  useEffect(() => () => { if (typeof nav.setContext === 'function') nav.setContext(null); }, [nav]);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
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
            resetKey={caseId}
            overlayMode={style.mode}
            outlineWidth={style.width}
            zoomLabelStyle={s.zoomAt}
          />
        )}
        <View style={[s.corner, s.cornerLeft]} pointerEvents="none">
          <Text style={s.cornerLabel}>Prediction</Text>
          <Text style={s.cornerValue}>{variantLabel(variant)} vs ground truth</Text>
        </View>
        <View style={[s.corner, s.cornerRight]} pointerEvents="none">
          <Text style={[s.cornerLabel, s.right]}>Slice Dice</Text>
          <Text style={[s.cornerValue, s.right]}>{showing ? diceCornerText(displayed.metrics) : '—'}</Text>
        </View>
        {blocking ? null : (
          <View style={s.chips}>
            {CLASS_ORDER.map((k) => (
              <ClassChip
                key={k}
                k={k}
                count={showing && counts ? counts[k.toLowerCase()] : null}
                on={visible[k]}
                onPress={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              />
            ))}
          </View>
        )}
        <DrawModeToolbar style={s.toolbar} mode={style.mode} onMode={(mode) => changeStyle({ mode })} />
      </View>

      <View style={s.panel}>
        <View style={s.row1}>
          <Text style={s.panelLabel}>Errors of</Text>
          <Text style={s.panelValue}>{variantLabel(variant)}</Text>
          <View style={s.spacer} />
          <SliceReadout index={scrubAt} total={total} />
        </View>
        <View style={s.row2}>
          <SliceControls index={scrubAt} pending={pending} total={total} onChange={userGoTo} playing={player.playing} onPlay={player.toggle} />
        </View>
      </View>

      {pixelNote && !blocking ? <Text style={[s.note, s.pad]}>{pixelNote}</Text> : null}

      <View style={s.section}>
        <SectionLabel title="Legend" meta={showing ? `Slice ${formatSlice(z, total)}` : '-'} />
        {CLASS_ORDER.map((k) => (
          <View key={k} style={s.legendRow}>
            <View style={[s.swatch, { borderColor: ERROR_CLASS[k].color, backgroundColor: `${ERROR_CLASS[k].color}55` }, ERROR_CLASS[k].dashed && s.swatchDashed]} />
            <View style={s.legendText}>
              <Text style={s.legendLabel}>{ERROR_CLASS[k].label}{showing && counts ? ` · ${counts[k.toLowerCase()]} px` : ''}{visible[k] ? '' : ' (hidden)'}</Text>
              <Text style={s.dim}>{ERROR_CLASS[k].detail}{outlined ? ` · ${ERROR_CLASS[k].dashed ? 'dashed' : 'solid'} edge` : ''}</Text>
            </View>
          </View>
        ))}
        <Text style={s.caption}>Counted from the two masks drawn here; tap a chip on the image to hide or show a class.</Text>
        {idsDiffer && <Text style={s.warn}>{ids.text}</Text>}
        {check && check.checked && <Text style={check.consistent ? s.okT : s.warn}>{check.text}</Text>}
        <View style={s.setting}>
          <Text style={[s.settingT, style.mode === OVERLAY_MODE.OUTLINE && s.settingOff]}>Fill opacity</Text>
          <SegmentedControl label="Fill opacity" options={OPACITY.map((o) => ({ value: o, label: `${Math.round(o * 100)} %` }))} value={opacity} onChange={setOpacity} />
        </View>
        <View style={s.setting}>
          <Text style={[s.settingT, style.mode === OVERLAY_MODE.FILL && s.settingOff]}>Outline width</Text>
          <SegmentedControl label="Outline width" options={OUTLINE_WIDTHS.map((w) => ({ value: w, label: `${w} px` }))} value={style.width} onChange={(w) => changeStyle({ width: w })} />
        </View>
      </View>

      <View style={s.section}>
        <SectionLabel title="Worst slices" />
        {run.view.state !== STATE.SUCCESS ? (
          <StatePanel view={run.view} what="the run metrics" compact onAction={(id) => (id === RECOVERY.BACK ? nav.pop() : metricsCall.refetch())} />
        ) : !selection.available ? (
          <Text style={selNote.tone === 'warn' ? s.warn : s.dim}>{selNote.text}</Text>
        ) : (
          <View style={s.worstList}>
            {worst.map((e, i) => {
              // An entry outside the volume is listed but not opened: goTo would clamp it to the edge slice.
              const opens = inVolume(e, total);
              const away = outsideVolumeNote(e, total);
              const text = worstEntryText(e, total);
              if (i === 0 && opens) {
                return (
                  <View key={e.sliceIndex} style={s.worstFirst}>
                    <Button label="Jump to the worst slice" icon={null} block onPress={() => userGoTo(e.sliceIndex)} accessibilityLabel={`Jump to the worst slice: ${text}`} />
                    <Text style={s.worstFirstT}>{text}</Text>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={e.sliceIndex}
                  style={[s.worst, !opens && s.worstOff]}
                  onPress={() => { if (opens) userGoTo(e.sliceIndex); }}
                  disabled={!opens}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !opens }}
                  accessibilityLabel={opens ? `Open ${text}` : `${text}, ${away}`}
                >
                  <Text style={s.worstRank}>{i === 0 ? 'Worst' : `#${i + 1}`}</Text>
                  <View style={s.worstText}>
                    <Text style={s.worstT}>{text}</Text>
                    {away ? <Text style={s.warn}>{away}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={s.section}>
        <SectionLabel title="Error profile" meta="FP + FN per slice" />
        <ProfileChart profile={profile} current={showing ? z : null} total={total} onPick={userGoTo} note={profileNote(run)} />
        <Text style={s.caption}>Pixels in error on each slice. Tap a bar to open that slice.</Text>
        {profile.problems.map((p) => <Text key={p} style={s.warn}>{p}</Text>)}
      </View>

      {runMetrics && (
        <View style={s.section}>
          <SectionLabel title="Case metrics" meta={variantLabel(runMetrics.variant)} />
          <MetricStrip
            cells={[
              { label: 'Dice', value: fmt(runMetrics.dice), caption: 'whole case' },
              { label: 'IoU', value: fmt(runMetrics.iou), caption: 'whole case' },
              { label: 'Volume error', value: runMetrics.relativeVolumeError === null || runMetrics.relativeVolumeError === undefined ? '—' : `${fmt(runMetrics.relativeVolumeError, 1)} %`, caption: 'RVE' },
            ]}
          />
          <Text style={s.metricLine}>FP {fmt(runMetrics.falsePositives)} · FN {fmt(runMetrics.falseNegatives)} voxels</Text>
        </View>
      )}

      <View style={[s.section, s.last]}>
        <Button
          label="3D error view"
          variant="secondary"
          block
          disabled={blocking}
          onPress={() => nav.push('SCR-05', { caseId, runId, sliceIndex: z ?? start, variant })}
        />
        {blocking ? <Text style={s.caption}>this slice did not load</Text> : null}
      </View>
    </ScrollView>
  );
}

// One error class as a layer chip over the image: the eye, a swatch in the class colour (dashed for FP, as its
// edge) and the class with its pixel count. Tap to hide or show it.
function ClassChip({ k, count, on, onPress }) {
  const c = ERROR_CLASS[k];
  const Eye = on ? IconEye : IconEyeOff;
  return (
    <TouchableOpacity
      style={s.chip}
      onPress={onPress}
      hitSlop={hitSlopFor(size.chip)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${c.label}${count !== null ? `, ${count} pixels` : ''}, ${on ? 'shown' : 'hidden'}`}
      testID={`class-${k}`}
    >
      <Eye size={18} color={color.t2} />
      <View style={[s.chipSwatch, { borderColor: c.color, backgroundColor: c.dashed ? 'transparent' : c.color }, c.dashed && s.swatchDashed, !on && s.swatchOff]} />
      <Text style={[s.chipT, !on && s.chipTOff]}>{k}{count !== null ? ` ${count} px` : ''}</Text>
    </TouchableOpacity>
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
              fill={c.rank === 0 ? ERROR_CLASS.FP.color : color.barNeutral}
            />
          ) : null))}
          {Number.isInteger(current) && <Rect x={current * bw} y={0} width={Math.max(2, bw)} height={H} fill="none" stroke={color.accent} strokeWidth={2} />}
        </Svg>
      )}
    </TouchableOpacity>
  );
}

const shadow = { textShadowColor: '#000000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingBottom: space.xl },
  center: { flex: 1, justifyContent: 'center', padding: space.l, gap: space.m },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  caseId: { ...type.viewerTitle, color: color.t1, fontVariant: ['tabular-nums'] },
  viewerBox: { width: '100%', aspectRatio: 1, backgroundColor: color.viewer },
  blocked: { flex: 1, justifyContent: 'center', paddingHorizontal: space.l },
  corner: { position: 'absolute', top: space.m },
  cornerLeft: { left: space.l },
  cornerRight: { right: space.l },
  cornerLabel: { ...type.caption, color: color.t2, ...shadow },
  cornerValue: { ...type.caption, fontWeight: '500', color: color.t1, fontVariant: ['tabular-nums'], ...shadow },
  right: { textAlign: 'right' },
  zoomAt: { right: space.l, top: space.m + 36 },
  chips: { position: 'absolute', left: space.l, bottom: space.l, gap: space.s, alignItems: 'flex-start' },
  chip: {
    height: size.chip, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: 10, paddingRight: space.m,
    borderRadius: radius.m, backgroundColor: color.glass, borderWidth: HAIRLINE, borderColor: color.glassEdge,
  },
  chipSwatch: { width: 14, height: 10, borderRadius: 2, borderWidth: 2 },
  chipT: { ...type.secondary, fontWeight: '500', color: color.t1, fontVariant: ['tabular-nums'] },
  chipTOff: { color: color.t2 },
  toolbar: { position: 'absolute', right: space.l, bottom: space.l },
  panel: { paddingTop: space.l, paddingHorizontal: space.l, paddingBottom: space.s, borderBottomWidth: HAIRLINE, borderColor: color.hair },
  row1: { height: size.segmented, flexDirection: 'row', alignItems: 'center', gap: space.s },
  panelLabel: { ...type.caption, color: color.t3 },
  panelValue: { ...type.secondary, fontWeight: '500', color: color.t1 },
  spacer: { flex: 1 },
  row2: { marginTop: space.m },
  pad: { paddingHorizontal: space.l, paddingTop: space.m },
  note: { ...type.caption, color: color.t2 },
  section: { paddingHorizontal: space.l, paddingTop: space.xl, gap: space.s },
  last: { paddingTop: space.xl },
  legendRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: space.m },
  legendText: { flex: 1 },
  legendLabel: { ...type.body, fontWeight: '500', color: color.t1, fontVariant: ['tabular-nums'] },
  swatch: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderStyle: 'solid' },
  swatchDashed: { borderStyle: 'dashed' },
  swatchOff: { opacity: 0.3 },
  setting: { gap: space.s, paddingTop: space.s },
  settingT: { ...type.body, color: color.t1 },
  settingOff: { color: color.t2 },
  worstList: { gap: space.xs },
  worstFirst: { gap: space.xs, paddingBottom: space.s },
  worstFirstT: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
  worst: {
    minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.m,
    borderTopWidth: HAIRLINE, borderColor: color.hair,
  },
  worstOff: { opacity: 0.7 },
  worstRank: { ...type.caption, fontWeight: '600', color: color.t2, width: 44 },
  worstText: { flex: 1, paddingVertical: space.s },
  worstT: { ...type.secondary, color: color.t1, fontVariant: ['tabular-nums'] },
  chart: { height: 64, width: '100%', backgroundColor: color.field, borderRadius: radius.s },
  metricLine: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
  caption: { ...type.caption, color: color.t3 },
  okT: { ...type.caption, color: color.live },
  warn: { ...type.caption, color: color.warn },
  dim: { ...type.caption, color: color.t2 },
});
