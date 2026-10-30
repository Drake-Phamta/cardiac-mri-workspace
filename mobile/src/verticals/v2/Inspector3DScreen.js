/*
 * SCR-05 - 3D Inspector (V2, Vũ Hùng Anh). Built as a skeleton under the Day 39 recovery override so that the hero
 * steps H6 and H7 run end to end on real data, extended on 2026-10-30 with the 3D error map (DR-005, decided by the
 * leader); the owner completes, measures (TC-3D-*, TC-PERF-002) and defends it.
 *
 * `10` §3 and the DEMO_STANDARD §4 bar, and where each is met:
 *   reconstructed LA            reconstruction_get -> a mesh reference; the mesh bytes through the shell's one binary
 *                               path (runtime.content: timeout, error mapping, SHA-256 against the id, DR-021 rule 1);
 *                               drawn by the self-contained WebGL2 viewer (viewerSource.mjs) in a WebView. The mesh is
 *                               the undecimated L0 surface (DR-008c) in the voxel-index frame: no millimetres.
 *   rotate, zoom, pan           one-finger orbit, two-finger pinch zoom and pan (in the viewer)
 *   error representation        error_reconstruction_get -> ONE error artifact (cardiac-errormesh/1) that becomes two
 *                               layers of their own, false positive (FP) and false negative (FN), next to the prediction
 *                               and the ground truth. Four layers, each with its own state and switch, a printed legend
 *                               (name, meaning, glyph - never colour alone) and FN hatched in the scene. The error mesh
 *                               is drawn only if it was made from the masks shown (reference_mask_id, prediction_mask_id).
 *   select (H7)                 a tap resolves to the source slice and the class of the FIRST face hit and the screen shows
 *                               "slice n / total" and what was hit; "Open in 2D" pushes SCR-03 at that slice, and for an FP
 *                               or FN face "Open errors" pushes SCR-04 at it, for the same run and variant, with
 *                               returnParams so Back reopens this screen on the same layers, camera and plane. A tap on the
 *                               background clears the selection and says so: nothing navigates by accident.
 *   2D <-> 3D                   the slice plane follows the 2D slice handed in by SCR-03 / SCR-04 - on entry and, with the
 *                               slice they end on, on Back (QA #98 N-6) - and a slider moves it.
 *   states                      loading, unavailable (with the API's own reason), error, success - app/core states drawn
 *                               by StateView; every data call goes through useCall (DR-021 rule 2). The prediction decides
 *                               the screen; every other layer reads its own state, so a missing error mesh never takes the
 *                               surfaces down.
 *
 * The state of the screen is one reducer (inspector3d.mjs `inspectorReducer`): the switches, the plane, the selection and
 * the camera. What a layer IS (loading / unavailable / error / ready) is derived from the calls, never stored.
 *
 * Fixture mode has no bytes behind any URL, so it shows the honest unavailable state (FIXTURE_NO_BYTES), not a mesh.
 * Ground truth - and so the error mesh - is requested only for a case that has it (INT-12: its prediction mesh is served,
 * its ground truth and error mesh never).
 */

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { emptyUnavailable, fatalInvalid, loading, RECOVERY, STATE } from '../../../../app/core/index.mjs';
import { createLatest } from '../../runtime/latest.mjs';
import useCall from '../../runtime/useCall';
import StateView, { StatePanel } from '../../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import CapabilityBadge from '../v1/CapabilityBadge';
import SliceScrubber from '../v1/SliceScrubber';
import { capabilityOf } from '../v1/capability.mjs';
import { variantOptions } from '../v1/explorer.mjs';
import { rememberedVariant, rememberVariant } from '../v1/session.mjs';
import {
  ACTION, effectiveVisibility, entryFromParams, ERROR_CONTAINER, ERROR_ROLES, errorCounts, errorMaskProblem,
  errorMeshRef, gridMatches, initialInspectorState, inspectorReducer, LAYER, LAYER_INFO, layerNote, layerStatus,
  maskIdForVariant, meshRef, openErrors, openIn2D, parseErrorMeshHeader, parseMeshHeader, parseViewerMessage, planeText,
  ROLE_ORDER, ROLES, screenStatus, selectionText, toViewer,
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
const TOGGLE_NAME = Object.freeze({ prediction: 'Prediction', groundTruth: 'Ground truth', falsePositive: 'FP', falseNegative: 'FN' });

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
      params={params}
      fromErrorView={params.view === 'error'}
    />
  );
}

function Inspector({ runtime, nav, caseId, runId, variant, kase, run, params, fromErrorView }) {
  const client = runtime.client;
  const capability = capabilityOf(kase.mode, kase.ground_truth_available);
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;
  const runOk = run.status === 'SUCCEEDED';
  const maskId = maskIdForVariant(run, variant);
  const wantPrediction = runOk && Boolean(maskId);
  // Ground truth - and the error mesh made from it - only for a case that has it, and only while a prediction mesh is
  // wanted at all.
  const gtWanted = kase.ground_truth_available === true && wantPrediction;
  const errWanted = gtWanted;

  // The state of the screen: where it starts is what its stack entry says (SCR-03 / SCR-04 handed a slice in, or Back
  // restored layers, camera and the slice the 2D screen ended on).
  const entry = useMemo(() => entryFromParams(params, total), [params, total]);
  const [ui, dispatch] = useReducer(inspectorReducer, null, () => initialInspectorState({
    slice: entry.slice, layers: entry.layers, camera: entry.camera, total,
  }));

  const basePath = runtime.contract.basePath;
  // What the viewer is asked to draw: bytes that hash to the id (runtime.content) AND parse as the format AND fit
  // this case's grid. One memo per layer, so the viewer is told once per mesh.
  const surfaceOf = (call, bytes) => {
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

  // 3. the error mesh: one artifact, two layers. Its bytes are fetched only once the masks it names are the masks shown.
  const errCall = useCall(client, 'error_reconstruction_get', { run_id: runId, variant }, { enabled: errWanted });
  const errData = errCall.view.state === STATE.SUCCESS ? errCall.view.data : null;
  const errProblem = useMemo(
    () => (errData && gtMaskId ? errorMaskProblem({ data: errData, variant, predictionMaskId: maskId, referenceMaskId: gtMaskId }) : null),
    [errData, gtMaskId, maskId, variant],
  );
  const errRef = useMemo(
    () => (errData && gtMaskId && !errProblem ? errorMeshRef(basePath, errData.error_mesh_artifact_id) : null),
    [errData, gtMaskId, errProblem, basePath],
  );
  const errBytes = useMeshBytes(runtime.content, errRef, Boolean(errRef));

  const predPrepared = useMemo(() => surfaceOf(predCall.view, predBytes.view), [predCall.view, predBytes.view, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const gtPrepared = useMemo(() => surfaceOf(gtCall.view, gtBytes.view), [gtCall.view, gtBytes.view, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const errPrepared = useMemo(() => {
    if (errCall.view.state !== STATE.SUCCESS) return errCall.view;
    if (!runtime.content.live) return emptyUnavailable('FIXTURE_NO_BYTES');
    if (!errorMeshRef(basePath, errData.error_mesh_artifact_id)) return emptyUnavailable('MESH_NOT_ADDRESSABLE');
    if (gtSlice.view.state !== STATE.SUCCESS) return gtSlice.view; // the reference mask id is not known yet (or could not be)
    if (errProblem) return fatalInvalid({ code: errProblem.code, safeMessage: errProblem.message });
    if (errBytes.view.state !== STATE.SUCCESS) return errBytes.view;
    const header = parseErrorMeshHeader(errBytes.view.data.bytes);
    if (!header.ok) return fatalInvalid({ code: header.code, safeMessage: header.message });
    if (!gridMatches(header.header, shape)) {
      return fatalInvalid({ code: 'GEOMETRY_MISMATCH', safeMessage: 'the error mesh was built for another grid than this case' });
    }
    return Object.freeze({ ...errBytes.view, header: header.header });
  }, [errCall.view, errBytes.view, gtSlice.view, errProblem, errData, basePath, shape, runtime.content.live]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => (errPrepared.state === STATE.SUCCESS && errPrepared.header ? errorCounts(errPrepared.header) : {}), [errPrepared]);

  const meshes = useMemo(() => ({
    prediction: predPrepared.state === STATE.SUCCESS && predPrepared.header
      ? { bytes: predPrepared.data.bytes, checksum: predPrepared.data.checksum } : null,
    groundTruth: gtPrepared.state === STATE.SUCCESS && gtPrepared.header
      ? { bytes: gtPrepared.data.bytes, checksum: gtPrepared.data.checksum } : null,
    [ERROR_CONTAINER]: errPrepared.state === STATE.SUCCESS && errPrepared.header
      ? { bytes: errPrepared.data.bytes, checksum: errPrepared.data.checksum } : null,
  }), [predPrepared, gtPrepared, errPrepared]);

  // the viewer
  const webRef = useRef(null);
  const sent = useRef({});
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState({});
  const [viewerErrors, setViewerErrors] = useState({});

  // layer states: each one reads its own steps; the prediction decides the screen, nothing else does
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
  const errorStatus = (role) => layerStatus({
    wanted: errWanted,
    reason: kase.ground_truth_available === true ? 'NO_PREDICTION_MESH_WANTED' : 'GROUND_TRUTH_UNAVAILABLE',
    steps: errWanted ? [gtSlice.view, errCall.view, errPrepared] : [],
    viewerLoaded: Boolean(loaded[role]),
    viewerError: viewerErrors[ERROR_CONTAINER],
  });
  const statuses = {
    prediction: predStatus, groundTruth: gtStatus, falsePositive: errorStatus(ROLES.FALSE_POSITIVE), falseNegative: errorStatus(ROLES.FALSE_NEGATIVE),
  };
  const overall = screenStatus(predStatus);
  const shown = effectiveVisibility(ui, statuses);
  cameraRef.current = ui.camera || entry.camera;

  const tell = useCallback((message) => { if (webRef.current && message) webRef.current.postMessage(message); }, []);
  useEffect(() => {
    if (!ready) return;
    for (const role of ['prediction', 'groundTruth', ERROR_CONTAINER]) {
      const item = meshes[role];
      if (item && sent.current[role] !== item.checksum) { sent.current[role] = item.checksum; tell(toViewer.mesh(role, item.bytes)); }
    }
  }, [ready, meshes, tell]);
  const shownKey = JSON.stringify(shown);
  useEffect(() => { if (ready) tell(toViewer.layers(shown)); }, [ready, shownKey, tell]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) tell(toViewer.slice(ui.plane)); }, [ready, ui.plane, tell]);
  useEffect(() => { if (ready) tell(toViewer.camera(cameraRef.current)); }, [ready, tell]);

  const onMessage = useCallback((event) => {
    const m = parseViewerMessage(event && event.nativeEvent ? event.nativeEvent.data : null);
    if (m.kind === 'ready') { sent.current = {}; setLoaded({}); setViewerErrors({}); setReady(true); }
    else if (m.kind === 'loaded') setLoaded((l) => ({ ...l, [m.role]: m }));
    else if (m.kind === 'error') {
      const key = m.role === ERROR_CONTAINER || ERROR_ROLES.includes(m.role) ? ERROR_CONTAINER : (m.role || ROLES.PREDICTION);
      setViewerErrors((e) => ({ ...e, [key]: m }));
    } else if (m.kind === 'pick') dispatch({ type: ACTION.PICK, pick: m, total });
    else if (m.kind === 'camera') dispatch({ type: ACTION.CAMERA, camera: m.camera });
  }, [total]);

  const retry = () => {
    setViewerErrors({}); sent.current = {};
    predCall.refetch(); predBytes.refetch(); gtSlice.refetch(); gtCall.refetch(); gtBytes.refetch();
    errCall.refetch(); errBytes.refetch();
  };
  const onStateAction = (id) => { if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) retry(); else nav.pop(); };

  // 3D -> 2D: what Back must restore rides in the same action as the push
  const ctx = { caseId, runId, variant, selection: ui.selection, total, visible: shown, camera: ui.camera };
  const plan2d = openIn2D(ctx);
  const planErrors = openErrors(ctx);
  const go = (plan) => { if (plan) { rememberVariant(variant); nav.push(plan.screenId, plan.params, plan.returnParams); } };
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

  const errorsReady = ERROR_ROLES.some((role) => statuses[role].state === LAYER.READY);
  const errorsUnavailable = ERROR_ROLES.every((role) => statuses[role].state === LAYER.UNAVAILABLE);
  let errorHint;
  if (kase.ground_truth_available !== true) {
    // `10` §7: no ground truth is an unavailable state, never an empty map that reads as zero error.
    errorHint = 'This case has no ground truth, so there is no 3D error map and no ground-truth surface - that is not zero error.';
  } else if (errorsReady) {
    errorHint = 'Error map: false-positive faces (▲) mark where the model segmented something the ground truth does not have; false-negative faces (▼, hatched) mark ground truth the model missed. Tap one to see its slice.';
  } else if (errorsUnavailable) {
    errorHint = `The 3D error map is unavailable (${statuses.falsePositive.reason || 'no reason given'}). The prediction and ground-truth surfaces still show where they differ.`;
  } else {
    errorHint = 'The 3D error map is not drawn (see its layers above). The prediction and ground-truth surfaces still show where they differ.';
  }
  const anyLayerError = ROLE_ORDER.some((role) => statuses[role].state === LAYER.ERROR);

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
        <View style={s.card}>
          <Text style={s.label}>Layers (legend)</Text>
          {ROLE_ORDER.map((role) => {
            const status = statuses[role];
            const count = ERROR_ROLES.includes(role) ? counts[role] : null;
            const triangles = ERROR_ROLES.includes(role) ? (count ? count.triangles : null) : (loaded[role] ? loaded[role].triangles : null);
            const usable = status.state === LAYER.READY && !(ERROR_ROLES.includes(role) && count && count.voxels === 0);
            const name = role === ROLES.PREDICTION ? `Prediction (${variant})` : LAYER_INFO[role].short;
            return (
              <LayerRow
                key={role}
                role={role}
                name={name}
                note={layerNote(role, status, { triangles, voxels: count ? count.voxels : null })}
                usable={usable}
                on={shown[role]}
                onToggle={() => dispatch({ type: ACTION.SET_VISIBLE, role, visible: !shown[role] })}
              />
            );
          })}
          {anyLayerError ? (
            <TouchableOpacity style={s.btn} onPress={retry} accessibilityRole="button">
              <Text style={s.btnT}>Retry failed layers</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={s.card}>
          <Text style={s.label}>Slice plane (follows the 2D slice)</Text>
          <SliceScrubber
            index={ui.plane}
            total={total}
            pending={null}
            onChange={(z) => dispatch({ type: ACTION.SLIDE, slice: z, total })}
            disabled={!Number.isInteger(total)}
          />
          <Text style={s.dim}>{planeText(ui.plane, total, ui.planeSource)}</Text>
          {entry.note ? <Text style={s.dim}>{entry.note}</Text> : null}
        </View>
        <View style={s.card}>
          <Text style={s.label}>Selected region (tap the surface)</Text>
          {Number.isInteger(ui.selection.slice) ? (
            <Text style={s.value}>{selectionText(ui.selection, total)}</Text>
          ) : (
            <Text style={s.dim}>{ui.selection.note || 'Nothing selected. Tap the surface to resolve the slice that produced that face.'}</Text>
          )}
          <View style={s.row}>
            <TouchableOpacity
              style={[s.btn, !plan2d && s.btnOff]}
              disabled={!plan2d}
              onPress={() => go(plan2d)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !plan2d }}
            >
              <Text style={[s.btnT, !plan2d && s.btnTOff]}>Open in 2D (SCR-03)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, !planErrors && s.btnOff]}
              disabled={!planErrors}
              onPress={() => go(planErrors)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !planErrors }}
            >
              <Text style={[s.btnT, !planErrors && s.btnTOff]}>Open errors (SCR-04)</Text>
            </TouchableOpacity>
          </View>
          {!plan2d ? <Text style={s.dim}>Open in 2D needs a selected slice.</Text> : null}
          {plan2d && !planErrors ? <Text style={s.dim}>Open errors needs a false-positive or false-negative face.</Text> : null}
        </View>
        <View style={s.row}>
          <TouchableOpacity style={s.btn} onPress={() => tell(toViewer.fit())} accessibilityRole="button">
            <Text style={s.btnT}>Fit camera</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.dim}>Drag to orbit · pinch to zoom · two fingers to pan · tap to select.</Text>
        <Text style={s.dim}>{fromErrorView ? 'Opened from the Error Inspector. ' : ''}{errorHint}</Text>
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

/* One layer of the legend: glyph on its colour, its name and meaning in words, its state, and its switch. */
function LayerRow({ role, name, note, usable, on, onToggle }) {
  const info = LAYER_INFO[role];
  return (
    <View style={s.layer}>
      <View style={[s.chip, { backgroundColor: info.color }]} accessibilityElementsHidden importantForAccessibility="no">
        <Text style={s.glyph}>{info.glyph}</Text>
      </View>
      <View style={s.layerText}>
        <Text style={s.value}>{name}</Text>
        <Text style={s.dim}>{info.detail}</Text>
        <Text style={s.dim}>{note}</Text>
      </View>
      <TouchableOpacity
        style={[s.toggle, !usable && s.btnOff]}
        disabled={!usable}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${name}: ${usable ? (on ? 'shown' : 'hidden') : 'not available'}`}
        accessibilityState={{ disabled: !usable }}
      >
        <Text style={[s.btnT, !usable && s.btnTOff]}>{`${TOGGLE_NAME[role]}: ${usable ? (on ? 'ON' : 'OFF') : 'n/a'}`}</Text>
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
  chip: { width: 24, height: 24, borderRadius: 4, marginRight: space.s, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: '#0e1116', fontSize: font.small, fontWeight: '700' },
  layerText: { flex: 1 },
  toggle: { minHeight: MIN_TOUCH, minWidth: 132, paddingHorizontal: space.m, borderRadius: 8, borderWidth: 1, borderColor: color.accent, backgroundColor: color.accentBg, alignItems: 'center', justifyContent: 'center' },
  btn: { minHeight: MIN_TOUCH, minWidth: 120, paddingHorizontal: space.l, borderRadius: 8, borderWidth: 1, borderColor: color.accent, backgroundColor: color.accentBg, alignItems: 'center', justifyContent: 'center' },
  btnT: { color: color.accent, fontSize: font.body, fontWeight: '600' },
  btnOff: { borderColor: color.border, backgroundColor: color.surface },
  btnTOff: { color: color.textFaint },
});
