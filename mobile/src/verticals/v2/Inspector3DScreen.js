/*
 * SCR-05 - 3D Inspector (V2, Vũ Hùng Anh). A WORKING SKELETON built under the Day 39 recovery override so that the hero
 * steps H6 and H7 run end to end on real data; the owner completes, measures (TC-3D-*, TC-PERF-002) and defends it.
 *
 * `10` §3 and the DEMO_STANDARD §4 bar, and where each is met:
 *   reconstructed LA            reconstruction_get -> a mesh reference; the mesh bytes through the shell's one binary
 *                               path (runtime.content: timeout, error mapping, SHA-256 against the id, DR-021 rule 1);
 *                               drawn by the self-contained WebGL2 viewer (viewerSource.mjs) in a WebView. The mesh is
 *                               the undecimated L0 surface (DR-008c) in the voxel-index frame: no millimetres.
 *   rotate, zoom, pan           one-finger orbit, two-finger pinch zoom and pan (in the viewer)
 *   optional error representation  prediction and ground truth as two layers with their own switch; where the surfaces
 *                               differ the disagreement shows. error_reconstruction_get stays unavailable while DR-005
 *                               is open and is not requested here: no fabricated error mesh.
 *   select (H7)                 a tap resolves to the source slice of the first face hit and the screen shows
 *                               "slice n / total"; "Open in 2D" pushes SCR-03 at that slice for the same run and
 *                               variant, with returnParams so Back reopens this screen on the same slice. A tap on the
 *                               background clears the selection and says so: nothing navigates by accident.
 *   states                      loading, unavailable (with the API's own reason), error, success - app/core states
 *                               drawn by StateView; every data call goes through useCall (DR-021 rule 2).
 *
 * Fixture mode has no bytes behind any URL, so it shows the honest unavailable state (FIXTURE_NO_BYTES), not a mesh.
 * Ground truth is requested only for a case that has it (INT-12: its prediction mesh is served, its ground truth never).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { emptyUnavailable, fatalInvalid, loading, RECOVERY, STATE } from '../../../../app/core/index.mjs';
import { createLatest } from '../../runtime/latest.mjs';
import useCall from '../../runtime/useCall';
import StateView, { StatePanel } from '../../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import CapabilityBadge from '../v1/CapabilityBadge';
import { capabilityOf } from '../v1/capability.mjs';
import { variantOptions } from '../v1/explorer.mjs';
import { rememberedVariant, rememberVariant } from '../v1/session.mjs';
import {
  gridMatches, LAYER, LAYER_COLOR, layerStatus, maskIdForVariant, meshRef, openIn2D, parseMeshHeader, parseViewerMessage,
  ROLE_LABEL, ROLES, screenStatus, SELECTION_NONE, selectionAfterPick, sliceText, toViewer, triangleText,
} from './inspector3d.mjs';
import { VIEWER_HTML } from './viewerSource.mjs';

/* The mesh bytes of one reference, latest-wins like useCall: aborted on unmount and when the reference changes. */
function useMeshBytes(content, ref, enabled) {
  const [view, setView] = useState(loading());
  const [epoch, setEpoch] = useState(0);
  const latest = useMemo(() => createLatest(), []);
  const key = ref ? `${ref.contentUrl}|${ref.checksum}` : '';
  useEffect(() => {
    if (!enabled || !ref) { latest.abort(); return undefined; }
    const ticket = latest.start();
    setView(loading());
    content.bytes(ref.contentUrl, { checksum: ref.checksum, signal: ticket.signal, kind: 'mesh' }).then((v) => {
      if (ticket.isLatest()) setView(v);
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, key, enabled, epoch, latest]);
  useEffect(() => () => latest.abort(), [latest]);
  const refetch = useCallback(() => setEpoch((n) => n + 1), []);
  return { view, refetch };
}

const PENDING = loading();

export default function Inspector3DScreen({ runtime, nav, params }) {
  const { caseId, runId } = params;
  const allowed = variantOptions(runtime.contract);
  const [variant, setVariant] = useState((allowed.includes(params.variant) && params.variant) || rememberedVariant());
  const caseCall = useCall(runtime.client, 'case_get', { case_id: caseId });
  const runCall = useCall(runtime.client, 'analysis_run_get', { run_id: runId });

  const onAction = useCallback((id) => {
    if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) { caseCall.refetch(); runCall.refetch(); } else nav.pop();
  }, [caseCall, runCall, nav]);

  if (caseCall.view.state !== STATE.SUCCESS) return <StateView view={caseCall.view} what={`case ${caseId}`} onAction={onAction} />;
  if (runCall.view.state !== STATE.SUCCESS) return <StateView view={runCall.view} what={`run ${runId}`} onAction={onAction} />;
  if (!variant) {
    // Never defaulted (`11` §6): the screen asks, like SCR-03.
    return (
      <View style={s.center}>
        <Text style={s.h2}>Prediction variant</Text>
        <Text style={s.dim}>Which prediction should the 3D surface show? There is no default.</Text>
        <View style={s.row}>
          {allowed.map((v) => (
            <TouchableOpacity key={v} style={s.btn} onPress={() => { rememberVariant(v); setVariant(v); }} accessibilityRole="button">
              <Text style={s.btnT}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }
  return (
    <Inspector
      runtime={runtime}
      nav={nav}
      caseId={caseId}
      runId={runId}
      variant={variant}
      kase={caseCall.view.data}
      run={runCall.view.data}
      initialSlice={Number.isInteger(params.sliceIndex) ? params.sliceIndex : null}
      fromErrorView={params.view === 'error'}
    />
  );
}

function Inspector({ runtime, nav, caseId, runId, variant, kase, run, initialSlice, fromErrorView }) {
  const client = runtime.client;
  const capability = capabilityOf(kase.mode, kase.ground_truth_available);
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;
  const runOk = run.status === 'SUCCEEDED';
  const maskId = maskIdForVariant(run, variant);
  const wantPrediction = runOk && Boolean(maskId);
  // Ground truth only for a case that has it, and only while a prediction mesh is wanted at all.
  const gtWanted = kase.ground_truth_available === true && wantPrediction;

  const basePath = runtime.contract.basePath;
  // What the viewer is asked to draw: bytes that hash to the id (runtime.content) AND parse as the format AND fit
  // this case's grid. One memo per layer, so the viewer is told once per mesh.
  const layerOf = (call, bytes) => {
    if (call.state !== STATE.SUCCESS) return call;
    if (!runtime.content.live) return emptyUnavailable('FIXTURE_NO_BYTES'); // no bytes exist behind any fixture reference
    const ref = meshRef(basePath, call.data.mesh_artifact_id);
    if (!ref) return emptyUnavailable('MESH_NOT_ADDRESSABLE');
    if (bytes.state !== STATE.SUCCESS) return bytes;
    const header = parseMeshHeader(bytes.data.bytes);
    if (!header.ok) return fatalInvalid({ code: header.code, safeMessage: header.message });
    if (!gridMatches(header.header, shape)) {
      return fatalInvalid({ code: 'GEOMETRY_MISMATCH', safeMessage: 'the mesh was built for another grid than this case' });
    }
    return Object.freeze({ ...bytes, header: header.header });
  };
  const refOf = (call) => (call.view.state === STATE.SUCCESS ? meshRef(basePath, call.view.data.mesh_artifact_id) : null);

  // 1. prediction mesh reference, then its bytes
  const predCall = useCall(client, 'reconstruction_get', { run_id: runId, mask_id: maskId || '' }, { enabled: wantPrediction });
  const predRef = useMemo(() => refOf(predCall), [predCall.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const predBytes = useMeshBytes(runtime.content, predRef, Boolean(predRef));

  // 2. ground truth: its mask id is the one the server states on a slice, never derived from a name
  const gtSlice = useCall(client, 'ground_truth_slice_get', { case_id: caseId, slice_index: 0 }, { enabled: gtWanted });
  const gtMaskId = gtSlice.view.state === STATE.SUCCESS ? gtSlice.view.data.reference_mask_id : null;
  const gtCall = useCall(client, 'reconstruction_get', { run_id: runId, mask_id: gtMaskId || '' }, { enabled: gtWanted && Boolean(gtMaskId) });
  const gtRef = useMemo(() => refOf(gtCall), [gtCall.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const gtBytes = useMeshBytes(runtime.content, gtRef, Boolean(gtRef));

  const predPrepared = useMemo(() => layerOf(predCall.view, predBytes.view), [predCall.view, predBytes.view, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const gtPrepared = useMemo(() => layerOf(gtCall.view, gtBytes.view), [gtCall.view, gtBytes.view, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const meshes = useMemo(() => ({
    prediction: predPrepared.state === STATE.SUCCESS && predPrepared.header
      ? { bytes: predPrepared.data.bytes, checksum: predPrepared.data.checksum, triangles: predPrepared.header.triangle_count } : null,
    groundTruth: gtPrepared.state === STATE.SUCCESS && gtPrepared.header
      ? { bytes: gtPrepared.data.bytes, checksum: gtPrepared.data.checksum, triangles: gtPrepared.header.triangle_count } : null,
  }), [predPrepared, gtPrepared]);

  // the viewer
  const webRef = useRef(null);
  const sent = useRef({});
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState({});
  const [viewerErrors, setViewerErrors] = useState({});
  const [show, setShow] = useState({ prediction: true, groundTruth: true });
  const [selection, setSelection] = useState(SELECTION_NONE);

  // The band on the surface: the picked slice, else the 2D slice this screen was opened from.
  const band = Number.isInteger(selection.slice) ? selection.slice : initialSlice;

  const tell = useCallback((message) => { if (webRef.current) webRef.current.postMessage(message); }, []);
  useEffect(() => {
    if (!ready) return;
    for (const role of [ROLES.PREDICTION, ROLES.GROUND_TRUTH]) {
      const item = meshes[role];
      if (item && sent.current[role] !== item.checksum) { sent.current[role] = item.checksum; tell(toViewer.mesh(role, item.bytes)); }
    }
  }, [ready, meshes, tell]);
  useEffect(() => { if (ready) tell(toViewer.layers(show.prediction, show.groundTruth)); }, [ready, show, tell]);
  useEffect(() => { if (ready) tell(toViewer.slice(band)); }, [ready, band, tell]);

  const onMessage = useCallback((event) => {
    const m = parseViewerMessage(event && event.nativeEvent ? event.nativeEvent.data : null);
    if (m.kind === 'ready') { sent.current = {}; setLoaded({}); setReady(true); }
    else if (m.kind === 'loaded') setLoaded((l) => ({ ...l, [m.role]: m }));
    else if (m.kind === 'error') setViewerErrors((e) => ({ ...e, [m.role || ROLES.PREDICTION]: m }));
    else if (m.kind === 'pick') {
      const next = selectionAfterPick(m, total);
      if (next) setSelection(next);
    }
  }, [total]);

  // layer states
  const predStatus = layerStatus({
    wanted: wantPrediction,
    reason: !runOk ? 'RUN_NOT_SUCCEEDED' : 'NO_PREDICTION_FOR_VARIANT',
    steps: maskId ? [predCall.view, predPrepared] : [],
    viewerLoaded: Boolean(loaded.prediction),
    viewerError: viewerErrors.prediction,
  });
  const gtStatus = layerStatus({
    wanted: gtWanted,
    reason: kase.ground_truth_available === true ? 'NO_PREDICTION_MESH_WANTED' : 'GROUND_TRUTH_UNAVAILABLE',
    steps: gtWanted ? [gtSlice.view, gtCall.view, gtPrepared] : [],
    viewerLoaded: Boolean(loaded.groundTruth),
    viewerError: viewerErrors.groundTruth,
  });
  const overall = screenStatus(predStatus);

  const retry = () => {
    setViewerErrors({}); sent.current = {};
    predCall.refetch(); predBytes.refetch(); gtSlice.refetch(); gtCall.refetch(); gtBytes.refetch();
  };
  const onStateAction = (id) => { if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) retry(); else nav.pop(); };

  const plan = openIn2D({ caseId, runId, variant, selection, total });
  const geometryNote = kase.geometry_validation_status === 'GEOMETRY_NOT_VALIDATED'
    ? 'Voxel-index frame (x = column, y = row, z = slice). Geometry is not validated: no millimetres are shown.' : null;

  // not a mesh: say why, with the API's reason (the prediction decides the screen)
  if (overall === 'unavailable' || overall === 'error') {
    const view = predStatus.view
      || (predStatus.state === LAYER.ERROR
        ? fatalInvalid({ code: predStatus.code, safeMessage: predStatus.message || 'the 3D viewer reported an error' })
        : emptyUnavailable(predStatus.reason || 'NO_RECONSTRUCTION', [RECOVERY.BACK]));
    return (
      <View style={s.root}>
        <Header caseId={caseId} capability={capability} runId={runId} variant={variant} />
        <StatePanel view={view} what="the 3D reconstruction" onAction={onStateAction} />
        <Text style={s.dim}>
          No mesh is drawn and nothing is substituted. The 2D viewer (SCR-03) still shows this run's slices.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Header caseId={caseId} capability={capability} runId={runId} variant={variant} />
      <View style={s.stage}>
        <WebView
          ref={webRef}
          style={s.web}
          source={{ html: VIEWER_HTML }}
          originWhitelist={['about:*', 'data:*']}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          setSupportMultipleWindows={false}
          mixedContentMode="never"
          scrollEnabled={false}
          overScrollMode="never"
          androidLayerType="hardware"
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || String(r.url).startsWith('data:')}
          onError={() => setViewerErrors((e) => ({ ...e, prediction: { code: 'WEBVIEW_ERROR', message: 'the WebView failed to load' } }))}
          accessibilityLabel="3D surface of the segmentation"
        />
        {overall === 'loading' ? (
          <View style={s.overlay} pointerEvents="none"><StatePanel view={PENDING} what="the 3D surface" compact /></View>
        ) : null}
      </View>
      <ScrollView style={s.panel} contentContainerStyle={s.panelBody}>
        <LayerRow role={ROLES.PREDICTION} label={`Prediction (${variant})`} status={predStatus} on={show.prediction}
          triangles={loaded.prediction && loaded.prediction.triangles}
          onToggle={() => setShow((v) => ({ ...v, prediction: !v.prediction }))} />
        <LayerRow role={ROLES.GROUND_TRUTH} label="Ground truth" status={gtStatus} on={show.groundTruth}
          triangles={loaded.groundTruth && loaded.groundTruth.triangles}
          onToggle={() => setShow((v) => ({ ...v, groundTruth: !v.groundTruth }))} />
        <View style={s.card}>
          <Text style={s.label}>Selected region (tap the surface)</Text>
          {Number.isInteger(selection.slice) ? (
            <Text style={s.value}>{sliceText(selection.slice, total)} · picked on {ROLE_LABEL[selection.role].toLowerCase()}</Text>
          ) : (
            <Text style={s.dim}>{selection.note || 'Nothing selected. Tap the surface to resolve the slice that produced that face.'}</Text>
          )}
          <Text style={s.dim}>
            {Number.isInteger(band)
              ? `Amber band on the surface: slice ${band + 1} of ${total}${Number.isInteger(selection.slice) ? ' (the picked slice)' : ' (the 2D slice you came from)'}.`
              : 'No slice band: no 2D slice is selected.'}
          </Text>
        </View>
        <View style={s.row}>
          <TouchableOpacity
            style={[s.btn, !plan && s.btnOff]}
            disabled={!plan}
            onPress={() => { if (plan) { rememberVariant(variant); nav.push(plan.screenId, plan.params, plan.returnParams); } }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !plan }}
          >
            <Text style={[s.btnT, !plan && s.btnTOff]}>Open in 2D (SCR-03)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btn} onPress={() => tell(toViewer.fit())} accessibilityRole="button">
            <Text style={s.btnT}>Fit camera</Text>
          </TouchableOpacity>
        </View>
        {!plan ? <Text style={s.dim}>Open in 2D needs a selected slice.</Text> : null}
        <Text style={s.dim}>Drag to orbit · pinch to zoom · two fingers to pan · tap to select.</Text>
        <Text style={s.dim}>
          {fromErrorView ? 'Opened from the Error Inspector. ' : ''}Error view: the 3D error reconstruction is not available
          yet (DR-005 is open). Where the two surfaces differ, the prediction and the ground truth show as separate layers.
        </Text>
        {geometryNote ? <Text style={s.dim}>{geometryNote}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Header({ caseId, capability, runId, variant }) {
  return (
    <View style={s.header}>
      <View style={s.row}>
        <Text style={s.caseId}>{caseId}</Text>
        <CapabilityBadge capability={capability} />
      </View>
      <Text style={s.dim}>Run {runId} · prediction {variant} · L0 surface (undecimated)</Text>
    </View>
  );
}

function LayerRow({ role, label, status, on, triangles, onToggle }) {
  const usable = status.state === LAYER.READY;
  let note = triangleText(triangles);
  if (status.state === LAYER.LOADING) note = 'loading…';
  else if (status.state === LAYER.UNAVAILABLE) note = `unavailable (${status.reason || 'no reason given'})`;
  else if (status.state === LAYER.ERROR) note = `error (${status.reason || 'unknown'})${status.message ? `: ${status.message}` : ''}`;
  return (
    <View style={s.layer}>
      <View style={[s.chip, { backgroundColor: LAYER_COLOR[role] }]} />
      <View style={s.layerText}>
        <Text style={s.value}>{label}</Text>
        <Text style={s.dim}>{note}</Text>
      </View>
      <TouchableOpacity
        style={[s.toggle, !usable && s.btnOff]}
        disabled={!usable}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ disabled: !usable }}
      >
        <Text style={[s.btnT, !usable && s.btnTOff]}>{`${label.split(' (')[0]}: ${usable ? (on ? 'ON' : 'OFF') : 'n/a'}`}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, justifyContent: 'center', padding: space.l },
  header: { paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.xs },
  caseId: { color: color.text, fontSize: font.h2, fontWeight: '700', marginRight: space.s },
  h2: { color: color.text, fontSize: font.h2, fontWeight: '700', marginBottom: space.xs },
  dim: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  value: { color: color.text, fontSize: font.body },
  label: { color: color.textFaint, fontSize: font.small, letterSpacing: 0.5, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  stage: { height: 300, marginHorizontal: space.l, borderWidth: 1, borderColor: color.border, borderRadius: 10, overflow: 'hidden', backgroundColor: color.surface },
  web: { flex: 1, backgroundColor: color.surface },
  overlay: { position: 'absolute', left: space.l, right: space.l, top: space.l },
  panel: { flex: 1 },
  panelBody: { padding: space.l },
  card: { borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, borderRadius: 10, padding: space.m, marginTop: space.s },
  layer: { flexDirection: 'row', alignItems: 'center', marginTop: space.s },
  chip: { width: 14, height: 14, borderRadius: 3, marginRight: space.s },
  layerText: { flex: 1 },
  toggle: { minHeight: MIN_TOUCH, minWidth: 132, paddingHorizontal: space.m, borderRadius: 8, borderWidth: 1, borderColor: color.accent, backgroundColor: color.accentBg, alignItems: 'center', justifyContent: 'center' },
  btn: { minHeight: MIN_TOUCH, minWidth: 120, paddingHorizontal: space.l, borderRadius: 8, borderWidth: 1, borderColor: color.accent, backgroundColor: color.accentBg, alignItems: 'center', justifyContent: 'center' },
  btnT: { color: color.accent, fontSize: font.body, fontWeight: '600' },
  btnOff: { borderColor: color.border, backgroundColor: color.surface },
  btnTOff: { color: color.textFaint },
});
