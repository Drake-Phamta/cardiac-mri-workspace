/*
 * SCR-03 Case Explorer, Direction A "Clinical viewer": the MRI slice fills the screen under the shell's floating app
 * bar (case, model and experiment, a run picker, the privacy shield, Info), with the layer chips, the draw-mode
 * toolbar and the bottom panel (variant, "Slice 45 / 88", slider, transport) floating over it. Ids, checksums, the
 * run line, the z index and the metric version go to the Details sheet; the entries to SCR-04/05/06 and the display
 * settings to the Tools sheet behind "more". The state lives in the createCaseExplorer model (cases.mjs).
 * MRI bytes are fetched in JS and shown as a data URI, so every byte a slice gesture costs is counted.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { loading, RECOVERY, STATE } from '../../api/states.mjs';
import {
  createCaseExplorer, LAYER, chooseRun, diceCornerText, metricsText, OPACITY_STEPS, runSubtitle, runText,
  createSerialRunner, variantLabel,
} from './cases.mjs';
import StateView, { StatePanel } from '../../components/StateView';
import { BottomPanel, TopScrim } from '../../components/Floating';
import { Button, Chip, SegmentedControl } from '../../components/Controls';
import { Sheet } from '../../components/DetailsSheet';
import { SectionLabel } from '../../components/ListRow';
import { IconChevronRight, IconShield } from '../../components/icons';
import { color, HAIRLINE, MIN_TOUCH, overlay, radius, size, space, type } from '../../components/theme';
import { CHROME } from '../../navigation/routes.mjs';
import SliceViewport, {
  DrawModeToolbar, outlineOf, SliceControls, SliceReadout, useMaskOverlay, useSlicePlayer,
} from './SliceView';
import { usePrivacyMode } from '../../lib/screenCapture';
import { PRIVACY, privacyText } from '../../lib/privacy.mjs';
import { sliceDetail } from '../../lib/sliceNumber.mjs';
import {
  OUTLINE_WIDTHS, OVERLAY_MODE, needsOutline, rememberedOverlayStyle, rememberOverlayStyle, VIEWER_ZOOM,
} from './sliceControls.mjs';
import {
  capabilityOf, VARIANT_TEXT, variantOptions, rememberedVariant, rememberVariant,
} from '../../lib/caseMode.mjs';
import { useScriptedRuns, useSliceTiming } from './scriptedRuns';

// Orange and cyan stay apart for every common colour-vision deficiency, and each layer is named in words too.
export const OVERLAY_COLOR = Object.freeze({ PREDICTION: overlay.prediction, GROUND_TRUTH: overlay.groundTruth });

// The bottom panel without the gesture inset (the app's SafeAreaView keeps that free), and the draw-mode toolbar.
// PANEL is the panel's height when its first row does not wrap. At 320 dp or a large font the slice number drops to a
// line of its own, so the panel measures its rows (PANEL_CHROME is what it adds round them: 16 + 16 and the hairline)
// and the picture, the chips and the toolbar are laid out above the height it reports.
const PANEL = size.bottomPanel - 20;
const PANEL_CHROME = 2 * space.l + HAIRLINE;
const TOOLBAR = 3 * size.tool + 2 * 2 + 2 * 3 + 2 * HAIRLINE;
// Corner annotations sit 8 dp under the floating bar, as in the mockup.
const CORNER_TOP = size.appBar + space.s;

export default function CaseExplorerScreen({ runtime, nav, params }) {
  const caseId = params.caseId;
  const [caseView, setCaseView] = useState(loading());
  const [epoch, setEpoch] = useState(0);
  const [runId, setRunId] = useState(params.runId || null);
  // A variant from another screen is used only if the contract serves it; otherwise the user is asked.
  const allowed = variantOptions(runtime.contract);
  const [variant, setVariant] = useState(
    (allowed.includes(params.variant) && params.variant) || rememberedVariant(),
  );
  // Stable, because it goes into what the screen reports to the header (a new function would re-render the shell).
  const changeRun = useCallback(() => setRunId(null), []);

  useEffect(() => {
    let alive = true;
    setCaseView(loading());
    runtime.client.call('case_get', { case_id: caseId }).then((v) => { if (alive) setCaseView(v); });
    return () => { alive = false; };
  }, [runtime, caseId, epoch]);

  const onCaseAction = useCallback((id) => {
    if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) setEpoch((e) => e + 1);
    else if (id === RECOVERY.BACK) nav.pop();
  }, [nav]);

  if (caseView.state !== STATE.SUCCESS) {
    return (
      <View style={s.underBar}>
        <StateView view={caseView} what={`case ${caseId}`} onAction={onCaseAction} />
      </View>
    );
  }

  const kase = caseView.data;
  const capability = capabilityOf(kase.mode, kase.ground_truth_available);
  const choice = chooseRun(kase.available_run_ids, runId);
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;

  // A case with no analysis run opens straight into the viewer with MRI and ground truth only. A run handed in
  // for such a case gets the same view, which names that run; it is never requested.
  const noRun = choice.runId === null && choice.choices.length === 0;
  const notListedRunId = noRun && choice.reason === 'requested-run-not-listed' ? runId : null;
  if (!noRun && (!choice.runId || !variant)) {
    return (
      <Chooser
        runtime={runtime}
        caseId={caseId}
        capability={capability}
        choice={choice}
        variant={variant}
        onRun={setRunId}
        onVariant={(v) => { rememberVariant(v); setVariant(v); }}
      />
    );
  }

  const initialSlice = Number.isInteger(params.sliceIndex) ? params.sliceIndex
    : (Number.isInteger(total) ? Math.floor(total / 2) : 0);

  return (
    <Explorer
      key={`${caseId}|${choice.runId || 'no-run'}`}
      runtime={runtime}
      nav={nav}
      caseId={caseId}
      kase={kase}
      capability={capability}
      runId={noRun ? null : choice.runId}
      runReason={choice.reason}
      notListedRunId={notListedRunId}
      initialVariant={noRun ? null : variant}
      initialSlice={initialSlice}
      onVariantChosen={rememberVariant}
      onChangeRun={choice.choices.length > 1 ? changeRun : null}
    />
  );
}

// The shell draws the app bar over this screen (viewer chrome) and hides the tab bar.
CaseExplorerScreen.chrome = CHROME.VIEWER;

// Before the viewer: choose the run and the prediction variant. Only a case's single run is picked automatically.
function Chooser({ runtime, caseId, capability, choice, variant, onRun, onVariant }) {
  const options = variantOptions(runtime.contract);
  return (
    <ScrollView style={s.chooserRoot} contentContainerStyle={s.chooser}>
      <Text style={s.chooserTitle}>{caseId}</Text>
      <Text style={s.dim}>{capability.label} · {capability.detail}</Text>
      {!capability.consistent && <Text style={s.warn}>{capability.problem}</Text>}

      <SectionLabel title="Analysis run" style={s.chooserSection} />
      {choice.reason === 'no-runs' && (
        <Text style={s.body}>This case lists no analysis run (available_run_ids is empty), so there is no prediction to inspect.</Text>
      )}
      {choice.reason === 'requested-run-not-listed' && (
        <Text style={s.warn}>The requested run is not one of this case's runs. Choose one of these:</Text>
      )}
      {choice.runId ? (
        <Text style={s.body}>{choice.runId}{choice.reason === 'only-run' ? '  (the only run for this case)' : ''}</Text>
      ) : choice.choices.map((id) => (
        <TouchableOpacity key={id} style={s.choice} onPress={() => onRun(id)} accessibilityRole="button">
          <Text style={s.choiceT}>{id}</Text>
          <IconChevronRight size={16} color={color.t3} />
        </TouchableOpacity>
      ))}

      {choice.reason !== 'no-runs' && (
        <>
          <SectionLabel title="Prediction variant" style={s.chooserSection} />
          <Text style={s.dim}>No default: choose which prediction to inspect. It stays on screen and never changes by itself.</Text>
          {options.map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.choice, variant === v && s.choiceOn]}
              onPress={() => onVariant(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: variant === v }}
            >
              <View style={s.choiceText}>
                <Text style={[s.choiceT, variant === v && s.choiceTOn]}>{variantLabel(v)}</Text>
                <Text style={s.dim}>{VARIANT_TEXT[v] || v}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}


/*
 * The viewer. It keeps three snapshots of the model:
 *   current    the latest; its state decides loading / error / PROCESSING
 *   shown      the latest SUCCESS one
 *   displayed  `shown` once its MRI bytes and masks are loaded. Image, overlays, readout, metric and provenance all
 *              come from `displayed`, so they change together (no new number over an old image).
 * Each slice request opens a gesture on runtime.netLog and the slice reaching the screen closes it, so every
 * switch writes one CMW_GESTURE line with all the requests it caused.
 */
function Explorer({
  runtime, nav, caseId, kase, capability, runId, runReason, notListedRunId, initialVariant, initialSlice, onVariantChosen,
  onChangeRun,
}) {
  const client = runtime.sliceClient || runtime.client;
  const net = runtime.netLog || null;
  const hasRun = typeof runId === 'string' && runId !== '';
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;
  const width = shape ? shape[0] : null;
  const height = shape ? shape[1] : null;
  const size2d = useMemo(() => (width && height ? { width, height } : null), [width, height]);
  const options = variantOptions(runtime.contract);
  const noRunText = notListedRunId
    ? `requested run ${notListedRunId} is not listed for this case`
    : 'no analysis run for this case';

  const model = useMemo(() => createCaseExplorer(client, { variant: initialVariant }), [client, initialVariant]);
  const [panelH, setPanelH] = useState(PANEL);
  const [current, setCurrent] = useState(model.current);
  const [shown, setShown] = useState(null);
  const [displayed, setDisplayed] = useState(null);
  const [pending, setPending] = useState(null);
  const [targetVariant, setTargetVariant] = useState(initialVariant);
  const [opacity, setOpacity] = useState(0.5);
  // Privacy mode (on by default): screenshots and casting of this screen show black while it is on.
  const privacy = usePrivacyMode('SCR-03');
  const [style, setStyle] = useState(() => rememberedOverlayStyle('SCR-03', { mode: OVERLAY_MODE.FILL, width: 2 }));
  const changeStyle = useCallback((patch) => setStyle((st) => {
    const next = { ...st, ...patch };
    rememberOverlayStyle('SCR-03', next);
    return next;
  }), []);
  const [tap, setTap] = useState(null);
  const [imageProblem, setImageProblem] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [prepareEpoch, setPrepareEpoch] = useState(0);
  const [runInfo, setRunInfo] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);

  const timing = useSliceTiming();
  const displayedRef = useRef(null);
  const overlaysRef = useRef(model.current.overlays);
  const lastLoadedUri = useRef(null);
  // Set to the Play button's stop() below; any slice action of the user's own stops a sweep first.
  const stopPlay = useRef(() => {});

  const settle = useCallback(() => {
    const c = model.current;
    setCurrent(c);
    overlaysRef.current = c.overlays;
    if (c.view.state === STATE.SUCCESS) {
      // targetVariant is not set here: a slice answer that lands while a variant switch is queued must not undo
      // the user's choice.
      setShown(c);
      timing.dataArrived(c.sliceIndex);
    } else if (c.view.state !== STATE.LOADING) {
      // The gesture ended in a state, not on a slice: close it with that state.
      if (net && net.openSeq !== null) net.end({ outcome: c.view.state });
      timing.stepFailed();
    }
  }, [model, net, timing]);

  const runner = useMemo(() => createSerialRunner({
    onSettled: ({ idle }) => { settle(); if (idle) setPending(null); },
    onError: (err) => {
      console.log(`CMW_SCREEN_ERROR ${JSON.stringify({ screen: 'SCR-03', message: String(err && err.message) })}`);
      settle();
    },
  }), [settle]);
  useEffect(() => () => runner.dispose(), [runner]);

  useEffect(() => {
    // A fresh open drops cached "unavailable" answers: the data may have arrived since the last visit.
    if (client.clearNegative) client.clearNegative();
    if (net) net.begin({ caseId, from: null, to: initialSlice, kind: 'open' });
    runner.run(() => model.open({ caseId, runId, sliceIndex: initialSlice }));
  }, [runner, model, net, client, caseId, runId, initialSlice]);

  // The run line (run, model family, experiment, precomputed), read once. With no run nothing is requested.
  useEffect(() => {
    if (!hasRun) { setRunInfo(null); return undefined; }
    let alive = true;
    (async () => {
      const r = await runtime.client.call('analysis_run_get', { run_id: runId });
      if (!alive) return;
      if (r.state !== STATE.SUCCESS) { setRunInfo({ run: { runId }, modelFamily: null, error: r.reason || r.state }); return; }
      const d = r.data;
      let modelFamily = null;
      if (typeof d.experiment_id === 'string' && d.experiment_id) {
        const e = await runtime.client.call('experiment_get', { experiment_id: d.experiment_id });
        if (e.state === STATE.SUCCESS && typeof e.data.model_family === 'string') modelFamily = e.data.model_family;
      }
      if (!alive) return;
      setRunInfo({
        run: {
          runId: d.run_id ?? runId,
          experimentId: d.experiment_id ?? null,
          precomputed: typeof d.precomputed === 'boolean' ? d.precomputed : null,
          status: d.status ?? null,
          failureCode: d.status === 'FAILED' ? (d.failure_code ?? null) : null,
          failureReason: d.status === 'FAILED' ? (d.failure_reason ?? null) : null,
        },
        modelFamily,
      });
    })();
    return () => { alive = false; };
  }, [runtime, runId, hasRun]);

  // The content_url and checksum of each layer of a snapshot, as the server stated them. A ref without a
  // content_url is read back from the slice cache (the response the model just fetched), with no request.
  const urlsFor = useCallback((snap) => {
    const none = { mri: null, pred: null, gt: null, sums: { mri: null, pred: null, gt: null } };
    if (!snap) return none;
    const z = snap.sliceIndex;
    const peek = (endpointId, p) => {
      const v = client.peek ? client.peek(endpointId, p) : null;
      return v && v.state === STATE.SUCCESS ? v.data : null;
    };
    const mriData = snap.imageRef && !snap.imageRef.contentUrl ? peek('mri_slice_get', { case_id: caseId, slice_index: z }) : null;
    const predData = snap.predictionRef && !snap.predictionRef.contentUrl
      ? peek('prediction_slice_get', { run_id: runId, slice_index: z, variant: snap.variant }) : null;
    const pick = (ref, data) => (ref ? (ref.contentUrl ?? (data && data.content_url) ?? null) : null);
    return {
      mri: pick(snap.imageRef, mriData),
      pred: pick(snap.predictionRef, predData),
      gt: pick(snap.groundTruthRef, null),
      sums: {
        mri: snap.imageRef ? snap.imageRef.checksum ?? null : null,
        pred: snap.predictionRef ? snap.predictionRef.checksum ?? null : null,
        gt: snap.groundTruthRef ? snap.groundTruthRef.checksum ?? null : null,
      },
    };
  }, [client, caseId, runId]);

  // Load the bytes of `shown`, then display it: image, masks and labels at once.
  useEffect(() => {
    if (!shown) return undefined;
    let alive = true;
    const u = urlsFor(shown);
    const jobs = [];
    if (u.mri && runtime.imageStore) {
      jobs.push(runtime.imageStore.load(u.mri, { checksum: u.sums.mri }).then(
        () => ({ ok: true }),
        (err) => ({ ok: false, mri: true, message: String(err && err.message) }),
      ));
    }
    if (u.pred && runtime.maskStore && size2d) {
      jobs.push(runtime.maskStore.load(u.pred, size2d, { checksum: u.sums.pred }).catch(() => null));
    }
    if (u.gt && runtime.maskStore && size2d && overlaysRef.current && overlaysRef.current[LAYER.GROUND_TRUTH]) {
      jobs.push(runtime.maskStore.load(u.gt, size2d, { checksum: u.sums.gt }).catch(() => null));
    }
    Promise.all(jobs).then((results) => {
      if (!alive) return;
      const failed = results.find((r) => r && r.mri && !r.ok);
      setImageError(failed ? { url: u.mri, message: failed.message } : null);
      displayedRef.current = shown;
      setDisplayed(shown);
      if (net && net.openSeq !== null && net.openTo === shown.sliceIndex) net.end({ outcome: failed ? 'image-error' : 'shown' });
      timing.stepShown(shown.sliceIndex);
    });
    return () => { alive = false; };
  }, [shown, prepareEpoch, urlsFor, runtime.imageStore, runtime.maskStore, size2d, net]);

  const goTo = useCallback((n) => {
    if (!Number.isInteger(n) || !Number.isInteger(total)) return;
    const z = Math.max(0, Math.min(total - 1, n));
    const from = displayedRef.current ? displayedRef.current.sliceIndex : null;
    setPending(z);
    if (net) net.begin({ caseId, from, to: z, kind: 'slice' });
    timing.startSample(z, Boolean(client.has && client.has('mri_slice_get', { case_id: caseId, slice_index: z })));
    runner.run(() => model.goToSlice(z), { key: 'slice' });
  }, [client, caseId, model, net, runner, timing, total]);

  const switchVariant = useCallback((v) => {
    if (!hasRun || v === targetVariant) return;
    stopPlay.current();
    onVariantChosen(v);
    setTargetVariant(v);
    const z = displayedRef.current ? displayedRef.current.sliceIndex : null;
    if (net) net.begin({ caseId, from: z, to: z, kind: 'variant' });
    runner.run(() => model.setVariant(v));
  }, [caseId, hasRun, model, net, onVariantChosen, runner, targetVariant]);

  const setOverlay = useCallback((layer, on) => {
    const c = model.setOverlay(layer, on);
    overlaysRef.current = c.overlays;
    setCurrent(c);
    if (c.view.state === STATE.SUCCESS) setShown(c);
  }, [model]);

  // Retry forgets every cached answer for this slice only, "unavailable" ones included. Other slices keep theirs,
  // so a Retry does not turn a later revisit pass into network traffic. SCR-04 does the same.
  const forgetSlice = useCallback((zz) => {
    if (client.clearWhere && Number.isInteger(zz)) {
      client.clearWhere((_ep, p) => p.slice_index === zz && (p.case_id === caseId || (hasRun && p.run_id === runId)));
    }
  }, [client, caseId, hasRun, runId]);

  const refreshSlice = useCallback(() => {
    stopPlay.current();
    const zz = model.current.sliceIndex;
    forgetSlice(zz);
    if (net && Number.isInteger(zz)) net.begin({ caseId, from: zz, to: zz, kind: 'refresh' });
    runner.run(() => model.refresh());
  }, [caseId, forgetSlice, model, net, runner]);

  const onStateAction = useCallback((id) => {
    if (id === RECOVERY.BACK) nav.pop();
    else if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) refreshSlice();
    else if (id === RECOVERY.VIEW_FAILURE) {
      const f = current.runFailure || (runInfo && runInfo.run) || {};
      Alert.alert('Analysis failed', `code ${f.code || f.failureCode || 'not stated'}\n${f.reason || f.failureReason || 'no reason recorded'}`);
    }
  }, [current, nav, refreshSlice, runInfo]);

  // What is on screen: everything below comes from `displayed`.
  const ok = displayed !== null;
  const state = current.view.state;
  const blocking = state !== STATE.SUCCESS && !(state === STATE.LOADING && ok);
  const switching = hasRun && ok && targetVariant !== displayed.variant;
  const z = ok ? displayed.sliceIndex : null;
  const u = urlsFor(displayed);
  const mriImage = u.mri && runtime.imageStore ? runtime.imageStore.peek(u.mri) : null;
  const imageUri = mriImage ? mriImage.uri : null;

  const overlays = current.overlays || {};
  const gtOn = overlays[LAYER.GROUND_TRUTH] === true;
  const predOn = overlays[LAYER.PREDICTION] === true;
  const pred = useMaskOverlay(runtime.maskStore, u.pred, size2d, u.sums.pred);
  const gt = useMaskOverlay(runtime.maskStore, gtOn ? u.gt : null, size2d, u.sums.gt);
  const predAvailable = ok && displayed.layersAvailable[LAYER.PREDICTION] === true;
  const gtAvailable = ok && displayed.layersAvailable[LAYER.GROUND_TRUTH] === true && displayed.groundTruthRef !== null;
  const outlined = needsOutline(style.mode);
  const layers = [
    {
      key: 'gt', path: gt.path, outline: outlined ? outlineOf(gt.mask) : null, color: OVERLAY_COLOR.GROUND_TRUTH, opacity,
      visible: !imageProblem && gtOn && gtAvailable,
    },
    {
      key: 'pred', path: pred.path, outline: outlined ? outlineOf(pred.mask) : null, color: OVERLAY_COLOR.PREDICTION, opacity,
      visible: !imageProblem && !switching && predOn && predAvailable,
    },
  ];

  useEffect(() => { setImageProblem(null); }, [imageUri]);

  const finishSample = useCallback((how) => timing.finishSample(how, z, u.mri, runtime.mode),
    [timing, z, u.mri, runtime.mode]);

  const onImageLoad = useCallback((e) => {
    lastLoadedUri.current = imageUri;
    const src = e && e.nativeEvent && e.nativeEvent.source;
    if (src && size2d && Number.isFinite(src.width) && Number.isFinite(src.height)
      && (src.width !== size2d.width || src.height !== size2d.height)) {
      setImageProblem(`MRI slice is ${src.width}x${src.height} but the case geometry says ${size2d.width}x${size2d.height}; overlays are not drawn over it.`);
    }
    finishSample('image');
  }, [finishSample, size2d, imageUri]);

  const onImageError = useCallback((e) => {
    setImageProblem(`MRI slice image failed to decode: ${(e && e.nativeEvent && e.nativeEvent.error) || 'unknown error'}`);
    finishSample('image-error');
  }, [finishSample]);

  // When no image load will come (fixture mode, no URL, a failed fetch, or the same image again: an <Image> whose
  // source did not change fires no onLoad), the timing sample ends when the slice is displayed.
  useEffect(() => {
    if (!ok || !timing.waitingForImage(z)) return;
    if (!imageUri) finishSample(imageError ? 'image-error' : 'no-image');
    else if (imageUri === lastLoadedUri.current) finishSample('image-unchanged');
  }, [ok, imageUri, imageError, z, displayed, finishSample, timing]);

  const { navRun, askScripted } = useScriptedRuns({
    timing, goTo, runtime, net, caseId, runId, hasRun, total, capability, targetVariant, overlaysRef, displayedRef,
  });

  // Play sweeps the slices one at a time (each one on screen before the next is asked for); a scripted run or a
  // slice that fails stops it.
  const player = useSlicePlayer({ total, goTo, displayed, failed: blocking, locked: Boolean(navRun) });
  stopPlay.current = player.stop;
  const userGoTo = useCallback((n) => { player.stop(); goTo(n); }, [player.stop, goTo]);

  const run = runInfo ? runInfo.run : { runId };
  // While the viewer shows a state instead of a slice, nothing from the previous slice (metric, provenance,
  // entries) stays on screen.
  const showing = ok && !blocking;
  const notLoaded = 'this slice did not load';
  let metrics;
  if (blocking) metrics = { text: 'Slice Dice: -', tone: 'neutral' };
  else if (!hasRun) metrics = { text: `Slice Dice: - (${noRunText})`, tone: 'neutral' };
  else if (ok && !switching) metrics = metricsText(displayed.metrics, displayed.variant);
  else metrics = { text: switching ? `Slice Dice: switching to ${targetVariant}…` : 'Slice Dice: -', tone: 'neutral' };
  let corner = '—';
  if (!blocking && hasRun && ok && !switching) corner = diceCornerText(displayed.metrics);
  else if (switching) corner = 'Switching…';
  const scrubAt = blocking ? current.sliceIndex : (ok ? displayed.sliceIndex : current.sliceIndex);
  const geometryNote = kase.geometry_validation_status === 'GEOMETRY_NOT_VALIDATED'
    ? 'Geometry not validated: index space only - no millimetre values are shown.' : null;
  let pixelNote = null;
  if (runtime.mode === 'fixture') pixelNote = 'Fixture mode: no pixels behind any URL. The grid is the source slice; gestures and states are real.';
  else if (ok && !u.mri) pixelNote = 'This response carries no content_url: no pixels to draw for this slice.';
  else if (imageError) pixelNote = `MRI slice could not be fetched: ${imageError.message}`;
  const needsRun = `needs an analysis run - ${noRunText}`;
  const noRunLine = (notListedRunId ? `Requested run ${notListedRunId} is not listed for this case` : 'No analysis run for this case')
    + ` - MRI${capability.groundTruthUsable ? ' and ground truth' : ''} only`;
  let errorEntry = null;
  if (!capability.groundTruthUsable) errorEntry = 'no ground truth for this case (Inference & review)';
  else if (!hasRun) errorEntry = needsRun;
  else if (blocking) errorEntry = notLoaded;
  else if (!ok) errorEntry = 'waiting for the slice';
  let threeDEntry = null;
  if (!hasRun) threeDEntry = needsRun;
  else if (blocking) threeDEntry = notLoaded;
  else if (!(ok && displayed.canEnter3D)) threeDEntry = 'needs a succeeded run with a reconstruction';
  let reviewEntry = null;
  if (!hasRun) reviewEntry = needsRun;
  else if (blocking) reviewEntry = notLoaded;
  else if (!(ok && predAvailable)) reviewEntry = 'needs this slice\'s prediction';
  const predWhy = switching ? `switching to ${targetVariant}…` : (pred.status === 'error' ? pred.error : (ok && !predAvailable ? 'not available for this slice' : null));
  const gtWhy = gt.status === 'error' ? gt.error : (ok && !gtAvailable ? 'not available for this slice' : null);
  // This screen unmounts under SCR-04/05/06, so each push also saves the run, variant and slice in this screen's
  // stack entry. Back then reopens exactly them, not the case's default run and slice.
  const back = () => ({ runId, variant: displayed.variant, sliceIndex: z });
  const open = (screenId, p) => { setToolsOpen(false); nav.push(screenId, p, back()); };

  // ----- What the shell's app bar and Details sheet show (nav.setContext) -----
  const priv = privacyText(privacy.status, privacy.on);
  const subtitle = hasRun
    ? runSubtitle(run, runInfo ? runInfo.modelFamily : null, { loading: runInfo === null, error: runInfo ? runInfo.error : null })
    : (notListedRunId ? `Run ${notListedRunId} not listed` : 'No analysis run');
  const openTools = useCallback(() => setToolsOpen(true), []);
  const actions = useMemo(() => [{
    key: 'privacy', icon: IconShield, label: priv.title, active: privacy.status === PRIVACY.PROTECTED, onPress: privacy.toggle,
  }], [priv.title, privacy.status, privacy.toggle]);
  const overflow = useMemo(() => ({ label: 'Tools: error inspector, 3D view, review, display', onPress: openTools }), [openTools]);
  const id = (ref) => (showing && ref ? `${ref.artifactId ?? '-'} · ${ref.checksum ?? '-'}` : '- · -');
  const detailSections = [
    {
      title: 'This slice',
      lines: [
        sliceDetail(showing ? z : null, total),
        metrics.text,
        `MRI ${id(displayed && displayed.imageRef)}`,
        hasRun ? `Prediction ${showing ? displayed.variant : '-'} ${id(displayed && displayed.predictionRef)}` : `Prediction - (${noRunText})`,
        capability.groundTruthUsable ? `Ground truth ${id(displayed && displayed.groundTruthRef)}` : null,
        tap ? `Last tap: source pixel ${tap.src ? `x ${tap.src[0]}, y ${tap.src[1]}` : 'outside the image'} on ${sliceDetail(tap.slice, total)} · zoom ×${tap.zoom.toFixed(1)}` : null,
      ].filter(Boolean),
    },
    {
      title: 'Run',
      lines: [
        hasRun ? runText(run, runInfo ? runInfo.modelFamily : null, { loading: runInfo === null, error: runInfo ? runInfo.error : null }) : noRunLine,
        runReason === 'only-run' ? 'The only run for this case' : null,
      ].filter(Boolean),
    },
    {
      title: 'Case and layers',
      lines: [
        `${capability.label}: ${capability.detail}`,
        capability.consistent ? null : capability.problem,
        hasRun ? `Prediction (${ok ? displayed.variant : targetVariant}): ${predOn && predAvailable && !switching ? 'shown' : 'hidden'}${predWhy ? ` - ${predWhy}` : ''}`
          : `Prediction: none - ${noRunText} (no prediction, metric or error layer).`,
        capability.groundTruthUsable
          ? `Ground truth: ${gtOn && gtAvailable ? 'shown' : 'hidden'}${gtWhy ? ` - ${gtWhy}` : ''}`
          : `Ground truth: none for this case (${capability.label}) - no ground-truth layer, metric or error view is offered.`,
        geometryNote,
      ].filter(Boolean),
    },
    { title: 'Privacy', lines: [priv.title, priv.detail].filter(Boolean) },
    { title: 'Scripted runs', lines: ['Long-press the slice number for the scripted runs (L4, A9); timings and bytes go to logcat.'] },
  ];
  const detailsKey = JSON.stringify(detailSections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = useMemo(() => detailSections, [detailsKey]);

  useEffect(() => {
    if (typeof nav.setContext !== 'function') return;
    nav.setContext({
      runId: hasRun ? runId : null,
      variant: hasRun ? targetVariant : null,
      title: caseId,
      subtitle,
      onSubtitlePress: onChangeRun || null,
      actions,
      overflow,
      details,
    });
  }, [nav, hasRun, runId, targetVariant, caseId, subtitle, onChangeRun, actions, overflow, details]);
  useEffect(() => () => { if (typeof nav.setContext === 'function') nav.setContext(null); }, [nav]);

  const notes = [
    navRun ? { key: 'run', text: `Scripted run in progress (${navRun}) - controls are locked.`, warn: true } : null,
    imageProblem ? { key: 'image', text: imageProblem, warn: true } : null,
    pixelNote && !blocking ? { key: 'pixels', text: pixelNote, warn: false } : null,
  ].filter(Boolean);

  return (
    <View style={s.root}>
      {blocking ? null : (
        <SliceViewport
          fill
          insets={{ top: size.appBar, bottom: panelH }}
          initialZoom={VIEWER_ZOOM}
          zoomLabelStyle={[s.zoomAt, { bottom: panelH + TOOLBAR + space.s }]}
          shape={shape}
          imageUri={imageUri}
          onImageLoad={onImageLoad}
          onImageError={onImageError}
          layers={layers}
          placeholderNote={pixelNote}
          resetKey={`${caseId}|${fitKey}`}
          onTap={(src, at) => setTap({ src, slice: z, zoom: at.zoom })}
          overlayMode={style.mode}
          outlineWidth={style.width}
        />
      )}

      {/* The scrim under the floating app bar: above the image, below the corner annotations. */}
      <TopScrim />

      <View style={[s.corner, s.cornerLeft]} pointerEvents="none">
        <Text style={s.cornerLabel}>MRI</Text>
        <Text style={s.cornerValue}>{capability.label}</Text>
      </View>
      <View style={[s.corner, s.cornerRight]} pointerEvents="none">
        <Text style={[s.cornerLabel, s.right]}>Slice Dice</Text>
        <Text style={[s.cornerValue, s.right]} testID="slice-dice">{corner}</Text>
      </View>

      {notes.length || imageError ? (
        <View style={s.notes} pointerEvents="box-none">
          {notes.map((n) => <Text key={n.key} style={[s.noteT, n.warn && s.noteWarn]}>{n.text}</Text>)}
          {imageError ? (
            <Button label="Fetch the image again" variant="secondary" onPress={() => setPrepareEpoch((n) => n + 1)} />
          ) : null}
        </View>
      ) : null}

      {blocking ? (
        <View style={[s.blocked, { bottom: panelH }]}>
          <StatePanel view={current.view} what={`slice ${(current.sliceIndex ?? 0) + 1}`} onAction={onStateAction} />
        </View>
      ) : (
        <View style={[s.chips, { bottom: panelH + space.l }]}>
          {capability.groundTruthUsable ? (
            <LayerChip label="Ground truth" swatch={OVERLAY_COLOR.GROUND_TRUTH} on={gtOn} available={gtAvailable} why={gtWhy}
              onToggle={(on) => setOverlay(LAYER.GROUND_TRUTH, on)} />
          ) : null}
          {hasRun ? (
            <LayerChip label="Prediction" swatch={OVERLAY_COLOR.PREDICTION} on={predOn} available={predAvailable && !switching} why={predWhy}
              onToggle={(on) => setOverlay(LAYER.PREDICTION, on)} />
          ) : null}
        </View>
      )}

      <DrawModeToolbar style={[s.toolbar, { bottom: panelH }]} mode={style.mode} onMode={(mode) => changeStyle({ mode })} />

      <BottomPanel testID="viewer-panel">
        <View testID="panel-rows" onLayout={(e) => setPanelH(Math.max(PANEL, Math.round(e.nativeEvent.layout.height + PANEL_CHROME)))}>
          <View style={s.row1}>
            <Text style={s.panelLabel}>Prediction</Text>
            {hasRun ? (
              <View style={navRun ? s.locked : null} pointerEvents={navRun ? 'none' : 'auto'}>
                <SegmentedControl
                  label="Prediction variant"
                  options={options.map((v) => ({ value: v, label: variantLabel(v) }))}
                  value={targetVariant}
                  onChange={switchVariant}
                />
              </View>
            ) : <Text style={s.panelNone}>No analysis run</Text>}
            <View style={s.readout}>
              <SliceReadout index={scrubAt} total={total} onLongPress={askScripted} />
            </View>
          </View>
          <View style={s.row2}>
            <SliceControls
              index={scrubAt}
              pending={pending}
              total={total}
              onChange={userGoTo}
              disabled={Boolean(navRun)}
              playing={player.playing}
              onPlay={player.toggle}
            />
          </View>
        </View>
      </BottomPanel>

      <Sheet visible={toolsOpen} onClose={() => setToolsOpen(false)} title="Tools" testID="tools-sheet">
        <View style={s.sheetSection}>
          <SectionLabel title="Open" />
          <View>
            <EntryRow
              label="Error inspector"
              detail="TP, FP and FN of this slice against ground truth"
              why={errorEntry}
              onPress={() => open('SCR-04', { caseId, runId, variant: displayed.variant, sliceIndex: z })}
            />
            <EntryRow
              label="3D view"
              detail="The case's surfaces, with this slice marked"
              why={threeDEntry}
              onPress={() => open('SCR-05', { caseId, runId, variant: displayed.variant, sliceIndex: z })}
            />
            <EntryRow
              label="Review and correct"
              detail="Accept, flag or correct this prediction"
              why={reviewEntry}
              onPress={() => open('SCR-06', { runId, caseId, variant: displayed.variant, sliceIndex: z })}
              last
            />
          </View>
        </View>
        <View style={s.sheetSection}>
          <SectionLabel title="Display" />
          <View style={s.setting}>
            <View style={s.settingHead}>
              <Text style={[s.settingT, style.mode === OVERLAY_MODE.FILL && s.settingOff]}>Outline width</Text>
              {style.mode === OVERLAY_MODE.FILL ? <Text style={s.settingNote}>not used while Fill is chosen</Text> : null}
            </View>
            <SegmentedControl
              label="Outline width"
              options={OUTLINE_WIDTHS.map((w) => ({ value: w, label: `${w} px` }))}
              value={style.width}
              onChange={(w) => changeStyle({ width: w })}
            />
          </View>
          <View style={s.setting}>
            <View style={s.settingHead}>
              <Text style={[s.settingT, style.mode === OVERLAY_MODE.OUTLINE && s.settingOff]}>Fill opacity</Text>
              {style.mode === OVERLAY_MODE.OUTLINE ? <Text style={s.settingNote}>not used while Outline is chosen</Text> : null}
            </View>
            <SegmentedControl
              label="Fill opacity"
              options={OPACITY_STEPS.map((o) => ({ value: o, label: `${Math.round(o * 100)} %` }))}
              value={opacity}
              onChange={setOpacity}
            />
          </View>
          <View style={s.sheetButtons}>
            <Button label="Fit to screen" variant="secondary" onPress={() => { setFitKey((k) => k + 1); setToolsOpen(false); }} />
            <Button label="Refresh this slice" variant="secondary" disabled={Boolean(navRun)} onPress={() => { setToolsOpen(false); refreshSlice(); }} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

// A layer chip; a layer the slice does not have is dimmed and says why to a screen reader (Details says it too).
function LayerChip({ label, swatch, on, available, why, onToggle }) {
  return (
    <View
      style={!available && s.chipOff}
      pointerEvents={available ? 'auto' : 'none'}
      accessibilityLabel={available ? undefined : `${label}: ${why || 'not available'}`}
    >
      <Chip label={label} swatch={swatch} on={on && available} onPress={() => onToggle(!on)} testID={`layer-${label}`} />
    </View>
  );
}

// One entry of the Tools sheet: a 56 dp row with the screen's name, what it shows (or why it is closed) and a chevron.
function EntryRow({ label, detail, why, onPress, last = false }) {
  return (
    <TouchableOpacity
      style={[s.entry, !last && s.entryLine, why && s.entryOff]}
      onPress={onPress}
      disabled={Boolean(why)}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(why) }}
    >
      <View style={s.entryText}>
        <Text style={s.entryT}>{label}</Text>
        <Text style={why ? s.entryWhy : s.entryDetail}>{why || detail}</Text>
      </View>
      {why ? null : <IconChevronRight size={20} color={color.t3} />}
    </TouchableOpacity>
  );
}

const shadow = { textShadowColor: '#000000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.viewer },
  // The shell's floating app bar covers the top 56 dp of a viewer-chrome screen.
  underBar: { flex: 1, paddingTop: size.appBar, backgroundColor: color.bg },
  corner: { position: 'absolute', top: CORNER_TOP },
  cornerLeft: { left: space.l },
  cornerRight: { right: space.l },
  cornerLabel: { ...type.caption, color: color.t2, ...shadow },
  cornerValue: { ...type.caption, fontWeight: '500', color: color.t1, fontVariant: ['tabular-nums'], ...shadow },
  right: { textAlign: 'right' },
  zoomAt: { right: space.l },
  notes: {
    position: 'absolute', top: CORNER_TOP + 32 + space.m, left: space.l, right: space.l, gap: space.s,
    padding: space.m, borderRadius: radius.m, backgroundColor: color.glass, borderWidth: HAIRLINE, borderColor: color.glassEdge,
  },
  noteT: { ...type.caption, color: color.t2 },
  noteWarn: { color: color.warn },
  blocked: { position: 'absolute', left: space.l, right: space.l, top: size.appBar, justifyContent: 'center' },
  chips: { position: 'absolute', left: space.l, gap: space.s, alignItems: 'flex-start' },
  chipOff: { opacity: 0.45 },
  toolbar: { position: 'absolute', right: space.l },
  // The first row wraps: where the label, the variant and the slice number do not fit one line (320 dp, a large font), the
  // slice number drops to a line of its own at the right instead of being pushed past the edge ("Slice" was all that showed).
  row1: { minHeight: size.segmented, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.s },
  panelLabel: { ...type.caption, color: color.t3 },
  panelNone: { ...type.secondary, color: color.t2 },
  locked: { opacity: 0.4 },
  // marginLeft auto: at the right of its line, beside the variant or on a line of its own.
  readout: { marginLeft: 'auto', flexShrink: 0 },
  row2: { marginTop: space.m },
  sheetSection: { gap: space.xs },
  setting: { gap: space.s, paddingVertical: space.s },
  settingT: { ...type.body, color: color.t1 },
  settingOff: { color: color.t2 },
  settingHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.s },
  settingNote: { ...type.caption, color: color.t3 },
  sheetButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingTop: space.s },
  entry: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  entryLine: { borderBottomWidth: HAIRLINE, borderColor: color.hair },
  entryOff: { opacity: 0.55 },
  entryText: { flex: 1, gap: 2 },
  entryT: { ...type.body, fontWeight: '500', color: color.t1 },
  entryDetail: { ...type.caption, color: color.t2 },
  entryWhy: { ...type.caption, color: color.t3 },
  dim: { ...type.caption, color: color.t2 },
  warn: { ...type.caption, color: color.warn },
  body: { ...type.body, color: color.t1 },
  chooserRoot: { flex: 1, backgroundColor: color.bg },
  chooser: { paddingTop: size.appBar + space.s, paddingHorizontal: space.l, paddingBottom: space.xl, gap: space.s },
  chooserTitle: { ...type.screenTitle, color: color.t1, fontVariant: ['tabular-nums'] },
  chooserSection: { marginTop: space.l },
  choice: {
    minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s,
    borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  choiceOn: { borderColor: color.accent },
  choiceText: { flex: 1, gap: 2 },
  choiceT: { ...type.rowId, color: color.t1, flex: 1 },
  choiceTOn: { color: color.accent },
});
