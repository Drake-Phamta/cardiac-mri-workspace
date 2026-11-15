// SCR-05 3D Inspector: shows the reconstructed left atrium as WebGL layers in a WebView: the prediction surface, the
// ground truth (see-through) and one marker per FP / FN error region. The WebView fills the screen (viewer chrome:
// the shell's app bar floats over it, the tab bar is hidden); the page draws the tools over the surface (layers,
// opacity, cut, views, Previous / Next: viewerTools.mjs) between the app bar and the bottom panel. This screen loads
// and checks the data, hands it to the page, and shows the selection in the bottom panel. A tap on the surface picks
// the slice that made that face; a tap on a marker selects its error region; "Open in 2D" opens SCR-03 on that slice.
// The app bar says the case and the prediction; the ids, checksums and sizes are the shell's Details sheet (nav.setContext).

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { emptyUnavailable, fatalInvalid, loading, RECOVERY, STATE } from '../../api/states.mjs';
import { createLatest } from '../../api/client.mjs';
import { useCall } from '../../api/RuntimeContext';
import { Button } from '../../components/Controls';
import { TopScrim } from '../../components/Floating';
import StateView, { StatePanel } from '../../components/StateView';
import { color, size, space, type } from '../../components/theme';
import { capabilityOf, variantOptions, rememberedVariant, rememberVariant } from '../../lib/caseMode.mjs';
import { experimentName } from '../../lib/experimentNames.mjs';
import { sliceParts } from '../../lib/sliceNumber.mjs';
import { CHROME } from '../../navigation/routes.mjs';
import {
  detailSections, errorSummaryText, errorsRef, gridMatches, LAYER, layerNotices, layerStatus, maskIdForVariant, meshRef,
  openIn2D, parseErrorGeometry, parseMeshHeader, parseViewerMessage, regionList, ROLES, screenStatus, SELECTION_NONE,
  selectionAfterPick, selectionAfterSmallToggle, selectionForMarker, selectionPanel, toViewer, VARIANT_LABEL,
} from './inspector3d.mjs';
import SelectionPanel from './SelectionPanel';
import { VIEWER_HTML } from './viewerHtml.mjs';
import { pageTextZoom } from './viewerTools.mjs';

// Loads the bytes of one artifact reference. Latest wins, like useCall: the request is aborted on unmount and when
// the reference changes.
function useArtifactBytes(content, ref, kind) {
  const [view, setView] = useState(loading());
  const [epoch, setEpoch] = useState(0);
  const latest = useMemo(() => createLatest(), []);
  const key = ref ? `${ref.contentUrl}|${ref.checksum}` : '';
  useEffect(() => {
    if (!ref) { latest.abort(); return undefined; }
    const ticket = latest.start();
    setView(loading());
    content.bytes(ref.contentUrl, { checksum: ref.checksum, signal: ticket.signal, kind }).then((v) => {
      if (ticket.isLatest()) setView(v);
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, key, epoch, latest]);
  useEffect(() => () => latest.abort(), [latest]);
  const refetch = useCallback(() => setEpoch((n) => n + 1), []);
  return { view, refetch };
}

const PENDING = loading();
// The bottom panel's height until it has been measured (the mockup's 188 dp includes the gesture inset the app keeps free).
const PANEL_GUESS = size.bottomPanel - 20;

// What the shell's app bar and Details sheet show: nav.setContext, set when it changes and cleared when the screen goes.
function useShellContext(nav, context) {
  useEffect(() => {
    if (context && typeof nav.setContext === 'function') nav.setContext(context);
  }, [nav, context]);
  useEffect(() => () => { if (typeof nav.setContext === 'function') nav.setContext(null); }, [nav]);
}

export default function Inspector3DScreen({ runtime, nav, params }) {
  const { caseId, runId } = params;
  const allowed = variantOptions(runtime.contract);
  const [variant, setVariant] = useState((allowed.includes(params.variant) && params.variant) || rememberedVariant());
  const caseCall = useCall(runtime.client, 'case_get', { case_id: caseId });
  const runCall = useCall(runtime.client, 'analysis_run_get', { run_id: runId });

  const onAction = useCallback((id) => {
    if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) { caseCall.refetch(); runCall.refetch(); } else nav.pop();
  }, [caseCall, runCall, nav]);

  // Before there is an Inspector (loading, an error, the variant question) the app bar names the case and not the run:
  // the Inspector reports its own bar once it has the data.
  const loaded = caseCall.view.state === STATE.SUCCESS && runCall.view.state === STATE.SUCCESS && Boolean(variant);
  const waiting = useMemo(() => (loaded ? null : { title: caseId, subtitle: '3D view' }), [loaded, caseId]);
  useShellContext(nav, waiting);

  if (caseCall.view.state !== STATE.SUCCESS) return <View style={s.belowBar}><StateView view={caseCall.view} what={`case ${caseId}`} onAction={onAction} /></View>;
  if (runCall.view.state !== STATE.SUCCESS) return <View style={s.belowBar}><StateView view={runCall.view} what="the analysis run" onAction={onAction} /></View>;
  if (!variant) {
    // The variant has no default (spec 11 §6), so the screen asks, like SCR-03.
    return (
      <View style={[s.stateBox, s.belowBar]}>
        <Text style={s.askTitle}>Which prediction?</Text>
        <Text style={s.askBody}>Choose the prediction the 3D surface is built from.</Text>
        <View style={s.askRow}>
          {allowed.map((v, i) => (
            <Button key={v} label={VARIANT_LABEL[v] || v} accessibilityLabel={v} variant={i === 0 ? 'primary' : 'secondary'}
              onPress={() => { rememberVariant(v); setVariant(v); }} />
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
    />
  );
}

// The shell frames this screen as a viewer: the app bar floats over it and the tab bar is hidden.
Inspector3DScreen.chrome = CHROME.VIEWER;

function Inspector({ runtime, nav, caseId, runId, variant, kase, run, initialSlice }) {
  const client = runtime.client;
  const capability = capabilityOf(kase.mode, kase.ground_truth_available);
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;
  const runOk = run.status === 'SUCCEEDED';
  const maskId = maskIdForVariant(run, variant);
  const wantPrediction = runOk && Boolean(maskId);
  // Ground truth and the error markers only for a case that has ground truth, and only with a prediction to compare.
  const gtWanted = kase.ground_truth_available === true && wantPrediction;

  const basePath = runtime.contract.basePath;
  // A layer is drawn only if its bytes match the checksum, parse as a mesh file and fit this case's grid.
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

  const predCall = useCall(client, 'reconstruction_get', { run_id: runId, mask_id: maskId || '' }, { enabled: wantPrediction });
  const predRef = useMemo(() => refOf(predCall), [predCall.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const predBytes = useArtifactBytes(runtime.content, predRef, 'mesh');

  // The ground-truth mask id is the one the server gives on a slice, never built from a name.
  const gtSlice = useCall(client, 'ground_truth_slice_get', { case_id: caseId, slice_index: 0 }, { enabled: gtWanted });
  const gtMaskId = gtSlice.view.state === STATE.SUCCESS ? gtSlice.view.data.reference_mask_id : null;
  const gtCall = useCall(client, 'reconstruction_get', { run_id: runId, mask_id: gtMaskId || '' }, { enabled: gtWanted && Boolean(gtMaskId) });
  const gtRef = useMemo(() => refOf(gtCall), [gtCall.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const gtBytes = useArtifactBytes(runtime.content, gtRef, 'mesh');

  // The error geometry: one marker per FP / FN region, drawn on the prediction surface it names.
  const errCall = useCall(client, 'error_reconstruction_get', { run_id: runId, variant }, { enabled: gtWanted });
  const errRef = useMemo(() => (errCall.view.state === STATE.SUCCESS ? errorsRef(basePath, errCall.view.data.error_mesh_artifact_id) : null),
    [errCall.view, basePath]);
  const errBytes = useArtifactBytes(runtime.content, errRef, 'errors');
  const predMeshId = predCall.view.state === STATE.SUCCESS ? predCall.view.data.mesh_artifact_id : null;
  const gtMeshId = gtCall.view.state === STATE.SUCCESS ? gtCall.view.data.mesh_artifact_id : null;

  const predPrepared = useMemo(() => layerOf(predCall.view, predBytes.view), [predCall.view, predBytes.view, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const gtPrepared = useMemo(() => layerOf(gtCall.view, gtBytes.view), [gtCall.view, gtBytes.view, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const errPrepared = useMemo(() => {
    const call = errCall.view;
    if (call.state !== STATE.SUCCESS) return call;
    if (!runtime.content.live) return emptyUnavailable('FIXTURE_NO_BYTES');
    if (call.data.prediction_mask_id !== maskId || call.data.prediction_variant !== variant) {
      return fatalInvalid({ code: 'ERRORS_OTHER_PREDICTION', safeMessage: 'the error geometry is for another prediction than the one shown' });
    }
    if (!errRef) return emptyUnavailable('ERRORS_NOT_ADDRESSABLE');
    if (errBytes.view.state !== STATE.SUCCESS) return errBytes.view;
    const parsed = parseErrorGeometry(errBytes.view.data.bytes, { shape, surfaceMeshId: predMeshId });
    if (!parsed.ok) return fatalInvalid({ code: parsed.code, safeMessage: parsed.message });
    // The regions largest first, each with its marker size and whether it is small: the one list the page and the panel follow.
    return Object.freeze({ ...errBytes.view, markers: regionList(parsed.markers) });
  }, [errCall.view, errBytes.view, errRef, predMeshId, shape, maskId, variant, runtime.content.live]);
  const markers = errPrepared.state === STATE.SUCCESS && errPrepared.markers ? errPrepared.markers : null;

  const meshes = useMemo(() => ({
    prediction: predPrepared.state === STATE.SUCCESS && predPrepared.header
      ? { bytes: predPrepared.data.bytes, checksum: predPrepared.data.checksum } : null,
    groundTruth: gtPrepared.state === STATE.SUCCESS && gtPrepared.header
      ? { bytes: gtPrepared.data.bytes, checksum: gtPrepared.data.checksum } : null,
  }), [predPrepared, gtPrepared]);

  const webRef = useRef(null);
  const sent = useRef({});
  // Counts the page's "ready" messages, so everything is sent again if the page ever restarts.
  const [ready, setReady] = useState(0);
  const [loaded, setLoaded] = useState({});
  const [viewerErrors, setViewerErrors] = useState({});
  const [selection, setSelection] = useState(SELECTION_NONE);
  // The page's "Small regions" switch (off by default): the panel counts the regions it leaves out.
  const [showSmall, setShowSmall] = useState(false);
  const [panelHeight, setPanelHeight] = useState(PANEL_GUESS);

  // The band on the surface shows the selected slice, else the 2D slice this screen was opened from.
  const band = Number.isInteger(selection.slice) ? selection.slice : initialSlice;

  const tell = useCallback((message) => { if (webRef.current) webRef.current.postMessage(message); }, []);
  useEffect(() => {
    if (!ready) return;
    for (const role of [ROLES.PREDICTION, ROLES.GROUND_TRUTH]) {
      const item = meshes[role];
      if (item && sent.current[role] !== item.checksum) { sent.current[role] = item.checksum; tell(toViewer.mesh(role, item.bytes)); }
    }
    if (markers && sent.current.errors !== errPrepared.data.checksum) {
      sent.current.errors = errPrepared.data.checksum;
      tell(toViewer.markers(markers));
    }
  }, [ready, meshes, markers, errPrepared, tell]);
  // The slice number the page shows is written here, with the app's one formatter.
  const bandLabel = Number.isInteger(band) && Number.isInteger(total) ? sliceParts(band, total).current : null;
  useEffect(() => { if (ready) tell(toViewer.slice(band, bandLabel)); }, [ready, band, bandLabel, tell]);
  // The page fills the screen: it keeps its tools clear of the app bar above and the bottom panel below.
  useEffect(() => { if (ready) tell(toViewer.insets(size.appBar, panelHeight)); }, [ready, panelHeight, tell]);
  useEffect(() => { if (ready) tell(toViewer.select(selection.marker ? selection.marker.id : null)); }, [ready, selection, tell]);
  // Leaving the screen: the page frees its GPU buffers. A layout-effect cleanup runs while the WebView is still there.
  useLayoutEffect(() => () => { if (webRef.current) webRef.current.postMessage(toViewer.dispose()); }, []);

  const onMessage = useCallback((event) => {
    const m = parseViewerMessage(event && event.nativeEvent ? event.nativeEvent.data : null);
    if (m.kind === 'ready') { sent.current = {}; setLoaded({}); setShowSmall(false); setReady((n) => n + 1); }
    else if (m.kind === 'loaded') setLoaded((l) => ({ ...l, [m.role]: m }));
    else if (m.kind === 'error') setViewerErrors((e) => ({ ...e, [m.role || ROLES.PREDICTION]: m }));
    else if (m.kind === 'marker') setSelection(selectionForMarker(markers, m.id));
    else if (m.kind === 'small') { setShowSmall(m.on); setSelection((s) => selectionAfterSmallToggle(s, m.on)); }
    else if (m.kind === 'pick') {
      const next = selectionAfterPick(m, total);
      if (next) setSelection(next);
    }
  }, [total, markers]);

  const predStatus = layerStatus({
    wanted: wantPrediction,
    reason: !runOk ? 'RUN_NOT_SUCCEEDED' : 'NO_PREDICTION_FOR_VARIANT',
    steps: maskId ? [predCall.view, predPrepared] : [],
    viewerLoaded: Boolean(loaded.prediction),
    viewerError: viewerErrors.prediction,
  });
  const gtReason = kase.ground_truth_available === true ? 'NO_PREDICTION_MESH_WANTED' : 'GROUND_TRUTH_UNAVAILABLE';
  const gtStatus = layerStatus({
    wanted: gtWanted,
    reason: gtReason,
    steps: gtWanted ? [gtSlice.view, gtCall.view, gtPrepared] : [],
    viewerLoaded: Boolean(loaded.groundTruth),
    viewerError: viewerErrors.groundTruth,
  });
  const errStatus = layerStatus({
    wanted: gtWanted,
    reason: gtReason,
    steps: gtWanted ? [errCall.view, errPrepared] : [],
    viewerLoaded: Boolean(loaded.prediction), // the markers are drawn with the prediction surface
    viewerError: viewerErrors.errors,
  });
  const overall = screenStatus(predStatus);

  const retry = () => {
    setViewerErrors({}); sent.current = {};
    predCall.refetch(); predBytes.refetch(); gtSlice.refetch(); gtCall.refetch(); gtBytes.refetch();
    errCall.refetch(); errBytes.refetch();
  };
  const onStateAction = (id) => { if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) retry(); else nav.pop(); };

  const plan = openIn2D({ caseId, runId, variant, selection, total });

  // The shell's app bar (the case, then the experiment and prediction) and Details sheet (what the main surface leaves
  // out: ids, checksums, mesh sizes, the z index, the frame, why a layer is missing).
  const geometryNote = kase.geometry_validation_status === 'GEOMETRY_NOT_VALIDATED'
    ? 'Voxel-index frame. Geometry is not validated: no millimetres are shown.' : null;
  const surfaceInfo = (label, meshId, mesh, seen) => ({
    label, id: meshId, checksum: mesh ? mesh.checksum : null, triangles: seen ? seen.triangles : null, vertices: seen ? seen.vertices : null,
  });
  const experimentId = run.experiment_id;
  const sections = detailSections({
    caseId,
    runId,
    experimentId,
    variant,
    modeLabel: capability.label,
    total,
    surfaces: [
      surfaceInfo('Prediction', predMeshId, meshes.prediction, loaded.prediction),
      surfaceInfo('Ground truth', gtMeshId, meshes.groundTruth, loaded.groundTruth),
    ],
    errorGeometryId: errCall.view.state === STATE.SUCCESS ? errCall.view.data.error_mesh_artifact_id : null,
    markers,
    selection,
    statuses: [['Ground truth', gtStatus], ['Errors', errStatus]],
    geometryNote,
  });
  const detailsKey = JSON.stringify(sections);
  const details = useMemo(() => sections, [detailsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The app bar names the experiment as people do ("DINOv2 100 % · Raw"); the id is in the Details sheet.
  const context = useMemo(
    () => ({
      title: caseId,
      subtitle: [experimentId ? experimentName(experimentId) : null, VARIANT_LABEL[variant]].filter(Boolean).join(' · '),
      details,
    }),
    [caseId, experimentId, variant, details],
  );
  useShellContext(nav, context);

  // No prediction mesh: show the API's reason instead of the viewer.
  if (overall === 'unavailable' || overall === 'error') {
    const view = predStatus.view
      || (predStatus.state === LAYER.ERROR
        ? fatalInvalid({ code: predStatus.code, safeMessage: predStatus.message || 'the 3D viewer reported an error' })
        : emptyUnavailable(predStatus.reason || 'NO_RECONSTRUCTION', [RECOVERY.BACK]));
    return (
      <View style={[s.stateBox, s.belowBar]}>
        <StatePanel view={view} what="the 3D reconstruction" onAction={onStateAction} />
        <Text style={s.askBody}>No 3D surface is shown. The 2D viewer still shows this run&apos;s slices.</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <WebView
        ref={webRef}
        style={s.web}
        source={{ html: VIEWER_HTML }}
        // The page's text follows the system font size, up to the label cap (viewerTools.mjs pageTextZoom).
        textZoom={pageTextZoom(PixelRatio.getFontScale())}
        originWhitelist={['about:*', 'data:*']}
        javaScriptEnabled
        // Privacy: nothing of this page is kept on the phone - no cache, no cookies, no storage, no history.
        incognito
        cacheEnabled={false}
        cacheMode="LOAD_NO_CACHE"
        domStorageEnabled={false}
        thirdPartyCookiesEnabled={false}
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
      {/* The scrim under the floating app bar: above the page, below the bar. */}
      <TopScrim />
      {overall === 'loading' ? (
        <View style={s.overlay} pointerEvents="none"><StatePanel view={PENDING} what="the 3D surface" compact /></View>
      ) : null}
      <SelectionPanel
        variant={variant}
        capability={capability}
        band={band}
        total={total}
        content={selectionPanel(selection, markers, total, showSmall)}
        summary={markers ? errorSummaryText(markers) : null}
        notices={layerNotices(gtStatus, errStatus)}
        openLabel={plan ? `Open in 2D at slice ${bandLabel}` : 'Open in 2D'}
        canOpen={Boolean(plan)}
        onOpen={() => { if (plan) { rememberVariant(variant); nav.push(plan.screenId, plan.params, plan.returnParams); } }}
        onHeight={setPanelHeight}
      />
    </View>
  );
}
const s = StyleSheet.create({
  // The WebView fills the whole screen, behind the floating app bar and the bottom panel.
  root: { flex: 1, backgroundColor: color.viewer },
  web: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: color.viewer },
  overlay: { position: 'absolute', left: space.l, right: space.l, top: size.appBar, bottom: PANEL_GUESS, justifyContent: 'center' },
  // The app bar floats over the top 56 dp of this screen, so content that is not the page starts below it.
  belowBar: { paddingTop: size.appBar, backgroundColor: color.viewer },
  stateBox: { flex: 1, justifyContent: 'center', paddingHorizontal: space.l, gap: space.m },
  askTitle: { ...type.screenTitle, color: color.t1 },
  askBody: { ...type.body, color: color.t2 },
  askRow: { flexDirection: 'row', gap: space.s, marginTop: space.s },
});