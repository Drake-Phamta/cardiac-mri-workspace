/*
 * SCR-06 — Review / Correction (V4, owner Nguyễn Gia Đức Trung).
 *
 * Built on Day 22 under the recovery override as a working skeleton; the
 * owner completes, measures and defends it from Day 23. Everything this file
 * does besides drawing is in reviewController.mjs (node-tested in
 * mobile/test/v4_review_screen.test.mjs); this file renders its state and
 * forwards taps and touches.
 *
 * `10` §3 SCR-06 and DEMO_STANDARD §4, and where each is on screen:
 *   source prediction mask        blue layer; its identity (variant + id) in the header
 *   current working mask          saved correction (purple) + unsaved edits (green add / red erase)
 *   source / unsaved / saved      told apart by layer colour AND a text badge (`10` §9: never colour alone)
 *   brush toolbar                 Brush|Pan, Add|Erase, size 0-5, Undo, Redo, Reset
 *   review state                  status + the transitions the model allows
 *   save / cancel                 Save asks first and names the source mask before it sends anything
 *
 * Fixture mode edits a SYNTHETIC stand-in (the bundle has no pixels) and says
 * so on the canvas. Live mode reads the run and each slice with the shell's
 * useCall (DR-021 rule 2: <RunReader> and <SliceReader> below fetch what the
 * controller wants and hand it back), gets the mask bytes through
 * runtime.content (timeout, mandatory checksum, abandoned on unmount), decodes
 * them with the shell's one PNG adapter (src/imaging/maskPng.js) and draws the
 * MRI slice under them from the verified bytes (runtime.imageStore). A review
 * that is already CORRECTED continues from its latest version (QA-063 N-4).
 * While a slice is UNSAVED, a leave guard asks before any navigation takes the
 * screen - and the brush session - away.
 */

import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Alert, Image, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';

import { RECOVERY, STATE } from '../../../../app/core/index.mjs';
import { RADII } from '../../../../app/verticals/v4_review_and_findings/brush.mjs';
import { decodeMaskPng } from '../../imaging/maskPng';
import useCall from '../../runtime/useCall';
import StateView, { StatePanel } from '../../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import { createReviewScreen, MASK_STATE, MODE, PHASE, PIXELS, TOOL } from './reviewController.mjs';

// Layer colours (dark theme). Each layer also has a text label in the legend.
const LAYER = Object.freeze({
  extent: '#141a22',
  source: '#58a6ff',
  savedAdd: '#d2a8ff',
  savedErase: '#4b3366',
  unsavedAdd: '#5fd39a',
  unsavedErase: '#f08a95',
});

const STATE_BADGE = Object.freeze({
  [MASK_STATE.SOURCE]: { label: 'SOURCE — no edits', fg: LAYER.source },
  [MASK_STATE.UNSAVED]: { label: 'UNSAVED edits', fg: color.warn },
  [MASK_STATE.SAVED]: { label: 'SAVED', fg: LAYER.savedAdd },
});

const PIXEL_REASON = Object.freeze({
  NO_DECODER: 'Mask pixels are unavailable: this runtime has no mask decoder wired. Review status still works.',
  CONTRACT_DRIFT: 'The served mask failed the contract checks (its checksum, or an 8-bit 0/255 PNG of this slice size), so it is not drawn.',
  VARIANT_MISMATCH: 'The server served another prediction variant than this review\'s, so it is not drawn.',
  SOURCE_MASK_MISMATCH: 'The server served a slice of another mask than this review\'s source prediction, so it is not drawn and cannot be edited.',
  TRANSPORT_UNREACHABLE: 'The mask bytes could not be fetched.',
  BASE_UNAVAILABLE: 'This review is already CORRECTED and continues from its latest version, but that version\'s slice could not be read. The slice is not editable: editing from the source would drop the earlier correction.',
  BASE_MISMATCH: 'The server answered another version than the review\'s latest, so the slice is not drawn. Refresh the review.',
});

const TRANSITION_LABEL = Object.freeze({
  ACCEPTED: 'Accept', FLAGGED: 'Flag', CORRECTED: 'Mark corrected', NOT_REVIEWED: 'Not reviewed',
});

function confirm(title, message, onOk) {
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', onPress: onOk }]);
}

function Btn({ label, onPress, disabled, active, danger, testID }) {
  return (
    <TouchableOpacity
      style={[s.btn, active && s.btnActive, danger && s.btnDanger, disabled && s.btnOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active) }}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[s.btnT, active && s.btnTActive, disabled && s.btnTOff]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Runs({ runs, fill, opacity = 1 }) {
  return runs.map((r, i) => <Rect key={i} x={r.x} y={r.y} width={r.len} height={1} fill={fill} opacity={opacity} />);
}

function Canvas({ ctl, st }) {
  const ref = useRef(null);
  const origin = useRef({ x: 0, y: 0 });
  const points = (evt) => evt.nativeEvent.touches.map((t) => ({ x: t.pageX - origin.current.x, y: t.pageY - origin.current.y }));
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => ctl.touch.grant(points(evt)),
    onPanResponderStart: (evt) => ctl.touch.fingers(points(evt)),
    onPanResponderMove: (evt) => ctl.touch.move(points(evt)),
    onPanResponderRelease: () => ctl.touch.release(),
    onPanResponderTerminate: () => ctl.touch.terminate(),
  }), [ctl]);

  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    ctl.setViewport(width, height);
    // Page origin of the canvas, as Spike A measured it: touches arrive in
    // page coordinates whichever child they land on.
    if (ref.current) ref.current.measure((x, y, w, h, px, py) => { origin.current = { x: px, y: py }; });
  }, [ctl]);

  const t = st.transform;
  const layers = st.layers;
  const [nx, ny] = st.shape || [0, 0];
  const px = st.slice && st.slice.pixels;
  const badge = st.slice && st.slice.maskState ? STATE_BADGE[st.slice.maskState] : null;
  const mri = st.slice ? st.slice.mriUri : null;
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
            <Rect x={0} y={0} width={nx} height={ny} fill={mri ? 'none' : LAYER.extent} />
            {layers && <Runs runs={layers.source} fill={LAYER.source} opacity={0.45} />}
            {layers && <Runs runs={layers.saved.filter((r) => r.kind === 'add')} fill={LAYER.savedAdd} opacity={0.85} />}
            {layers && <Runs runs={layers.saved.filter((r) => r.kind === 'erase')} fill={LAYER.savedErase} opacity={0.9} />}
            {layers && <Runs runs={layers.unsaved.filter((r) => r.kind === 'add')} fill={LAYER.unsavedAdd} opacity={0.9} />}
            {layers && <Runs runs={layers.unsaved.filter((r) => r.kind === 'erase')} fill={LAYER.unsavedErase} opacity={0.85} />}
          </G>
        </Svg>
      )}
      {badge && (
        <Text style={[s.badge, { color: badge.fg, borderColor: badge.fg }]} testID="mask-state">{badge.label}</Text>
      )}
      {px && px.kind === PIXELS.SYNTHETIC && (
        <Text style={s.synthetic}>SYNTHETIC stand-in — fixture mode has no pixels. Not a prediction, not patient data.</Text>
      )}
      {px && px.kind === PIXELS.LOADING && <Text style={s.overlayMsg}>Loading slice…</Text>}
      {px && px.kind === PIXELS.UNAVAILABLE && (
        <View style={s.overlayBox}>
          <Text style={s.overlayT} testID="pixels-unavailable">
            {PIXEL_REASON[px.reason] || `Mask pixels unavailable (${px.reason}).`}
          </Text>
          {px.retryable && <Btn label="Retry slice" onPress={() => ctl.retrySlice()} />}
        </View>
      )}
      {px && px.kind === PIXELS.SERVED && !mri && st.slice.mriReason && (
        <Text style={s.mriNote}>MRI image unavailable ({st.slice.mriReason}); the masks are drawn on the dark extent.</Text>
      )}
    </View>
  );
}

/*
 * The two reads of SCR-06, through the shell's useCall (DR-021 rule 2). Neither
 * draws anything: each fetches what the controller says it wants - latest wins,
 * aborted on unmount or when no longer wanted - and hands the answer back.
 * A reader is keyed by what it fetches, so a view of another slice or another
 * ask can never be handed in under the wrong one.
 */
function RunReader({ ctl, client, runId }) {
  const { view } = useCall(client, 'analysis_run_get', { run_id: runId });
  useEffect(() => { if (view.state !== STATE.LOADING) ctl.provideRun(view); }, [view, ctl]);
  return null;
}

function SliceReader({ ctl, client, want }) {
  const prediction = useCall(client, 'prediction_slice_get',
    { run_id: want.runId, slice_index: want.z, variant: want.variant });
  const mri = useCall(client, 'mri_slice_get', { case_id: want.caseId, slice_index: want.z }, { enabled: want.needsMri });
  const reviewed = useCall(client, 'reviewed_mask_slice_get',
    { reviewed_mask_id: want.baseVersionId, slice_index: want.z }, { enabled: Boolean(want.baseVersionId) });
  const done = prediction.view.state !== STATE.LOADING
    && (!want.needsMri || mri.view.state !== STATE.LOADING)
    && (!want.baseVersionId || reviewed.view.state !== STATE.LOADING);
  useEffect(() => {
    if (!done) return;
    ctl.provideSlice(want.z, {
      prediction: prediction.view,
      mri: want.needsMri ? mri.view : null,
      reviewed: want.baseVersionId ? reviewed.view : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, ctl]);
  return null;
}

function Legend() {
  const item = (fill, label) => (
    <View style={s.legendItem} key={label}>
      <View style={[s.swatch, { backgroundColor: fill }]} />
      <Text style={s.legendT}>{label}</Text>
    </View>
  );
  return (
    <View style={s.legend}>
      {item(LAYER.source, 'source')}
      {item(LAYER.savedAdd, 'saved correction')}
      {item(LAYER.unsavedAdd, 'unsaved add')}
      {item(LAYER.unsavedErase, 'unsaved erase')}
    </View>
  );
}

export default function ReviewCorrectionScreen({ runtime, nav, params }) {
  // One AbortController per screen instance: unmounting abandons a byte fetch
  // still in flight (runtime.content honours the signal).
  const life = useMemo(() => (typeof AbortController === 'function' ? new AbortController() : null), [runtime, params]);
  const ctl = useMemo(
    () => createReviewScreen({ runtime, params, decodeMaskPng, signal: life ? life.signal : null }),
    [runtime, params, life],
  );
  const client = runtime.client;
  const [, tick] = useReducer((n) => n + 1, 0);
  useEffect(() => ctl.subscribe(tick), [ctl]);
  useEffect(() => { ctl.start(); }, [ctl]);
  useEffect(() => () => { if (life) life.abort(); }, [life]);
  const st = ctl.getState();

  // N-2: a covered screen unmounts in this navigator, so leaving with UNSAVED
  // slices would drop the brush session. While any slice is unsaved, every
  // way off the screen (Back, Android back, a tab, a push) asks first.
  const guarded = typeof nav.setLeaveGuard === 'function';
  useEffect(() => {
    if (!guarded) return;
    if (st.canLeave) { nav.setLeaveGuard(null); return; }
    nav.setLeaveGuard(() => new Promise((resolve) => {
      Alert.alert('Unsaved edits', `${ctl.getState().leaveBlockedReason} Leave anyway?`, [
        { text: 'Stay', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Discard and leave', style: 'destructive', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    }));
  }, [guarded, st.canLeave, nav, ctl]);

  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) {
      // With the shell's guard the navigator asks; without it, never leave by
      // ourselves while a slice is unsaved.
      const now = ctl.getState();
      if (guarded || now.canLeave) nav.pop();
      else Alert.alert('Unsaved edits', now.leaveBlockedReason);
    } else if (id === RECOVERY.REFRESH || id === RECOVERY.RETRY) ctl.refresh();
  }, [ctl, nav, guarded]);

  if (st.phase === PHASE.CHOOSE_VARIANT) {
    return (
      <View style={s.pad}>
        <Text style={s.h1}>Which prediction do you want to review?</Text>
        <Text style={s.body}>
          A review is scoped to one prediction variant, and the app never picks one for you (spec 11 §6). Run {params.runId}.
        </Text>
        <View style={s.row}>
          <Btn label="RAW prediction" onPress={() => ctl.chooseVariant('RAW')} testID="variant-RAW" />
          <Btn label="PROCESSED prediction" onPress={() => ctl.chooseVariant('PROCESSED')} testID="variant-PROCESSED" />
        </View>
      </View>
    );
  }
  // The reads the controller wants, fetched with useCall (DR-021 rule 2).
  const readers = (
    <>
      {st.wants.run && <RunReader key={`run#${st.wants.run.epoch}`} ctl={ctl} client={client} runId={st.wants.run.runId} />}
      {st.wants.slice && <SliceReader key={`slice#${st.wants.slice.ticket}`} ctl={ctl} client={client} want={st.wants.slice} />}
    </>
  );
  if (st.phase !== PHASE.READY) {
    return (
      <>
        {readers}
        <StateView view={st.blockedView} what="the review" onAction={onAction} />
      </>
    );
  }

  const r = st.review;
  const b = st.brush;
  const editable = st.canEdit;
  const writable = r.canWrite && !st.busy;
  const src = b.source;

  const askSave = () => {
    const lines = [
      `Source: ${src.variant} prediction ${src.maskId}${src.synthetic ? ' — SYNTHETIC stand-in (fixture mode)' : ''}`,
      `Slices: ${b.unsavedSlices.join(', ')}`,
      `Review: ${r.status} -> CORRECTED (a new immutable reviewed-mask version; the source is never changed)`,
    ];
    if (r.status === 'ACCEPTED') lines.push('This review was ACCEPTED; saving a correction moves it to CORRECTED.');
    confirm('Save correction?', lines.join('\n'), () => ctl.save({ confirmed: r.status === 'ACCEPTED' }));
  };
  const askStatus = (t) => {
    if (t.confirm) {
      confirm(`${TRANSITION_LABEL[t.to]}?`, `This review was ACCEPTED. Changing it to ${t.to} keeps the earlier decision in the audit history.`,
        () => ctl.setStatus(t.to, { confirmed: true }));
    } else ctl.setStatus(t.to);
  };

  return (
    <View style={s.root}>
      {readers}
      <View style={s.head}>
        <Text style={s.mono} numberOfLines={1}>
          {src.variant} · {src.maskId}{src.synthetic ? ' · SYNTHETIC' : ''}
        </Text>
        {r.latestVersion && (
          <Text style={s.mono} numberOfLines={2} testID="latest-version">
            Latest version {r.latestVersion.reviewed_mask_id} · source {r.latestVersion.source_mask_id}
            {r.latestVersion.source_mask_kind ? ` (${r.latestVersion.source_mask_kind})` : ''} · {r.reviewedMasks.length} version(s)
          </Text>
        )}
        {b.baseId && (
          <Text style={s.mono} numberOfLines={2} testID="continuing">
            Continuing from version {b.baseId}; Reset returns to the original {src.variant} prediction.
          </Text>
        )}
        <View style={s.headRow}>
          <Text style={s.status} testID="review-status">Review: {r.status} · rev {r.revision}</Text>
          <View style={s.sliceNav}>
            <Btn label="‹" onPress={() => ctl.prevSlice()} disabled={st.slice.index <= 0 || Boolean(st.busy)} />
            <Text style={s.sliceT}>slice {st.slice.index} / {st.slice.total}</Text>
            <Btn label="›" onPress={() => ctl.nextSlice()} disabled={st.slice.index >= st.slice.total - 1 || Boolean(st.busy)} />
          </View>
        </View>
      </View>

      {r.view.state !== STATE.SUCCESS && (
        <View style={s.banner}><StatePanel view={r.view} what="the review" onAction={onAction} compact /></View>
      )}
      {st.notice && (
        <Text style={[s.notice, st.notice.kind === 'refused' && s.noticeWarn]} testID="notice">{st.notice.text}</Text>
      )}

      <Canvas ctl={ctl} st={st} />
      <Legend />

      <ScrollView style={s.tools} contentContainerStyle={s.toolsIn}>
        <View style={s.row}>
          <Btn label="Brush" active={st.mode === MODE.BRUSH} onPress={() => ctl.setMode(MODE.BRUSH)} />
          <Btn label="Pan" active={st.mode === MODE.PAN} onPress={() => ctl.setMode(MODE.PAN)} />
          <Btn label="Add" active={b.tool === TOOL.ADD} disabled={!editable} onPress={() => ctl.setTool(TOOL.ADD)} />
          <Btn label="Erase" active={b.tool === TOOL.ERASE} disabled={!editable} onPress={() => ctl.setTool(TOOL.ERASE)} />
        </View>
        <View style={s.row}>
          <Text style={s.label}>size</Text>
          {RADII.map((rad) => (
            <Btn key={rad} label={String(rad)} active={b.radius === rad} disabled={!editable} onPress={() => ctl.setRadius(rad)} />
          ))}
        </View>
        <View style={s.row}>
          <Btn label="Undo" disabled={!editable || !b.canUndo} onPress={() => ctl.undo()} />
          <Btn label="Redo" disabled={!editable || !b.canRedo} onPress={() => ctl.redo()} />
          <Btn label="Reset" danger disabled={!editable || (b.maskState === MASK_STATE.SOURCE && !b.canRedo)}
            onPress={() => confirm('Reset to the source?', 'Every open slice goes back to the source mask and the undo history is cleared.', () => ctl.reset())} />
          <Btn label="−" onPress={() => ctl.zoomBy(0.5)} />
          <Btn label="Fit" onPress={() => ctl.fitView()} />
          <Btn label="+" onPress={() => ctl.zoomBy(2)} />
        </View>
        <View style={s.row}>
          <Text style={s.label}>review</Text>
          {r.transitions.map((t) => (
            <Btn key={t.to} label={TRANSITION_LABEL[t.to] || t.to} disabled={!writable || !t.ok} onPress={() => askStatus(t)} />
          ))}
        </View>
        {r.transitions.some((t) => t.code === 'CORRECTED_BY_COMMIT_ONLY') && (
          <Text style={s.hint}>CORRECTED is reached only by saving a correction (Save), never by a status change.</Text>
        )}
        <View style={s.row}>
          <Btn label="Cancel edits" disabled={!editable || b.unsavedSlices.length === 0}
            onPress={() => confirm('Discard unsaved edits?', 'The working mask goes back to the last save (or the source).', () => ctl.cancel())} />
          <Btn label={st.busy === 'saving' ? 'Saving…' : 'Save'} active disabled={!st.canSave} onPress={askSave} testID="save" />
          <Btn label="New finding here" disabled={!guarded && !st.canLeave}
            onPress={() => nav.push('SCR-08', {
              caseId: st.target.caseId, runId: st.target.runId, variant: st.target.variant, sliceIndex: st.slice.index,
            }, {
              // Back reopens this review on the variant and slice that were on screen.
              caseId: st.target.caseId, variant: st.target.variant, sliceIndex: st.slice.index,
            })} />
        </View>
        {!guarded && !st.canLeave && <Text style={s.hint}>{st.leaveBlockedReason}</Text>}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { flex: 1, padding: space.l, gap: space.m, backgroundColor: color.bg },
  h1: { color: color.text, fontSize: font.h1, fontWeight: '700' },
  body: { color: color.text, fontSize: font.body, lineHeight: 20 },
  head: { paddingHorizontal: space.m, paddingTop: space.s, gap: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mono: { color: color.textDim, fontFamily: font.mono, fontSize: font.small },
  status: { color: color.text, fontSize: font.body, fontWeight: '700' },
  sliceNav: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sliceT: { color: color.text, fontFamily: font.mono, fontSize: font.small },
  banner: { paddingHorizontal: space.m, paddingTop: space.s },
  notice: { color: color.ok, fontSize: font.small, paddingHorizontal: space.m, paddingTop: space.xs },
  noticeWarn: { color: color.warn },
  canvas: { flex: 1, margin: space.s, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', minHeight: 240 },
  badge: {
    position: 'absolute', top: space.s, left: space.s, fontFamily: font.mono, fontSize: font.small, fontWeight: '700',
    borderWidth: 1, borderRadius: 6, paddingHorizontal: space.s, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.6)',
  },
  synthetic: {
    position: 'absolute', bottom: space.s, left: space.s, right: space.s, color: color.warn, fontSize: font.small,
    backgroundColor: 'rgba(42,31,20,0.85)', padding: space.xs, borderRadius: 6,
  },
  overlayMsg: {
    position: 'absolute', top: '40%', left: space.l, right: space.l, color: color.text, fontSize: font.body, textAlign: 'center',
  },
  overlayBox: { position: 'absolute', top: '30%', left: space.l, right: space.l, alignItems: 'center', gap: space.s },
  overlayT: { color: color.text, fontSize: font.body, textAlign: 'center' },
  mriNote: {
    position: 'absolute', bottom: space.s, left: space.s, right: space.s, color: color.textDim, fontSize: font.small,
    backgroundColor: 'rgba(0,0,0,0.6)', padding: space.xs, borderRadius: 6,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m, paddingHorizontal: space.m },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  legendT: { color: color.textDim, fontSize: font.small },
  tools: { maxHeight: 300 },
  toolsIn: { padding: space.s, gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  label: { color: color.textDim, fontSize: font.small, minWidth: 40 },
  hint: { color: color.textDim, fontSize: font.small },
  btn: {
    minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: space.m, borderRadius: 8, borderWidth: 1,
    borderColor: color.border, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center',
  },
  btnActive: { borderColor: color.accent, backgroundColor: color.accentBg },
  btnDanger: { borderColor: color.danger },
  btnOff: { opacity: 0.4 },
  btnT: { color: color.text, fontSize: font.body, fontWeight: '600' },
  btnTActive: { color: color.accent },
  btnTOff: { color: color.textDim },
});
