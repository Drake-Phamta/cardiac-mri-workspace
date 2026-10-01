/*
 * SCR-03 - Case Explorer / 2D MRI Inspector (V1, Phạm Tuấn Anh; built under
 * the Day 22 override, revalidated by the owner on D23).
 *
 * `10` §3 and the DEMO_STANDARD §4 bar, and where each is met:
 *   current slice image            the MRI PNG from content_url, drawn by <Image>
 *                                  (one slice per request - NFR-PERF-001: no
 *                                  full-volume transfer per gesture)
 *   slice n / total                SliceScrubber, from the case's shape[2]
 *   active run / model, precomputed  the header line, from analysis_run_get +
 *                                  experiment_get; always visible. A case with
 *                                  no run yet (available_run_ids empty) says so
 *                                  and opens MRI + ground truth only: no run,
 *                                  prediction, metric or error request is made
 *   active prediction variant      the header switch; never defaulted (asked
 *                                  on first use), never switched silently - a
 *                                  switch hides the old mask until the new
 *                                  variant's answer is on screen
 *   overlay controls               prediction / ground truth toggles + opacity
 *   metrics when valid             the per-slice Dice line (server values only)
 *   entry to 3D / error / review   SCR-05 / SCR-04 / SCR-06, each disabled with
 *                                  its reason when its data is not there
 *   gestures                       pinch-zoom and pan (SliceViewport), slider
 *                                  and step buttons (SliceScrubber)
 *
 * The state lives in the V1 model (app/verticals/v1_case_explorer). This file
 * runs its actions one at a time (serialRunner: the newest slice wins) and
 * draws from the model's snapshots - the latest for its state, the last
 * SUCCESS one once its bytes are in hand for everything on screen (see
 * Explorer). A non-success state hides the image instead of leaving an older
 * slice under a newer label.
 *
 * The MRI bytes are fetched in JS (imageStore) and shown as a data URI, so
 * every byte a slice gesture costs is counted (CMW_GESTURE, L4) and a revisit
 * is provably free; Spike A measured exactly this data-URI path on the A17.
 *
 * Fixture mode has no bytes behind any URL: the viewport shows the source
 * grid (so gestures still work) and says so; nothing is fetched.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { loading, RECOVERY, STATE } from '../../../../app/core/index.mjs';
import { createCaseExplorer, LAYER } from '../../../../app/verticals/v1_case_explorer/index.mjs';
import StateView, { StatePanel } from '../../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import CapabilityBadge from './CapabilityBadge';
import SliceScrubber from './SliceScrubber';
import SliceViewport from './SliceViewport';
import useMaskOverlay from './useMaskOverlay';
import { capabilityOf } from './capability.mjs';
import {
  buildNavSequence, chooseRun, metricsText, OPACITY_STEPS, runText, sliceLabel,
  VARIANT_TEXT, variantOptions,
} from './explorer.mjs';
import { createSerialRunner } from './serialRunner.mjs';
import { rememberedVariant, rememberVariant } from './session.mjs';

export const OVERLAY_COLOR = Object.freeze({ PREDICTION: '#f0883e', GROUND_TRUTH: '#39c5cf' });

const now = () => (global.performance ? global.performance.now() : Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDev = () => (typeof __DEV__ !== 'undefined' ? __DEV__ : null);
const short = (s) => (typeof s === 'string' && s.length > 24 ? `${s.slice(0, 23)}…` : (s ?? '-'));

export default function CaseExplorerScreen({ runtime, nav, params }) {
  const caseId = params.caseId;
  const [caseView, setCaseView] = useState(loading());
  const [epoch, setEpoch] = useState(0);
  const [runId, setRunId] = useState(params.runId || null);
  // A variant handed in by another screen must be one the contract serves;
  // anything else is ignored and the user is asked (never coerced).
  const allowed = variantOptions(runtime.contract);
  const [variant, setVariant] = useState(
    (allowed.includes(params.variant) && params.variant) || rememberedVariant(),
  );

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
    return <StateView view={caseView} what={`case ${caseId}`} onAction={onCaseAction} />;
  }

  const kase = caseView.data;
  const capability = capabilityOf(kase.mode, kase.ground_truth_available);
  const choice = chooseRun(kase.available_run_ids, runId);
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;

  // A case with no analysis run yet (available_run_ids empty) opens straight
  // into the viewer with MRI + ground truth only: nothing to choose, and no
  // prediction, metric or error layer (the V1 model answers them
  // UNAVAILABLE NO_ANALYSIS_RUN and asks for no run data).
  const noRun = choice.reason === 'no-runs';
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
      initialVariant={noRun ? null : variant}
      initialSlice={initialSlice}
      onVariantChosen={rememberVariant}
      onChangeRun={choice.choices.length > 1 ? () => setRunId(null) : null}
    />
  );
}

/* ---------------------------------------------------------------------------
 * Before the viewer: which run, which prediction variant. Nothing is picked
 * for the user except a case's only run, which is then shown as such.
 */
function Chooser({ runtime, caseId, capability, choice, variant, onRun, onVariant }) {
  const options = variantOptions(runtime.contract);
  return (
    <ScrollView contentContainerStyle={s.chooser}>
      <View style={s.caseRow}>
        <Text style={s.caseId}>{caseId}</Text>
        <CapabilityBadge capability={capability} />
      </View>
      <Text style={s.dim}>{capability.detail}</Text>
      {!capability.consistent && <Text style={s.warn}>{capability.problem}</Text>}

      <Text style={s.h2}>Analysis run</Text>
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
        </TouchableOpacity>
      ))}

      {choice.reason !== 'no-runs' && (
        <>
          <Text style={s.h2}>Prediction variant</Text>
          <Text style={s.dim}>No default: choose which prediction to inspect. It stays on screen and never changes by itself.</Text>
          {options.map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.choice, variant === v && s.choiceOn]}
              onPress={() => onVariant(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: variant === v }}
            >
              <Text style={s.choiceT}>{v}</Text>
              <Text style={s.dim}>{VARIANT_TEXT[v] || v}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}


/* ---------------------------------------------------------------------------
 * The viewer.
 *
 * Three snapshots of the V1 model are in play:
 *   current    the latest one - its state decides loading / error / PROCESSING;
 *   shown      the latest SUCCESS one - what the model says is on this slice;
 *   displayed  `shown` once its MRI bytes and mask paths are in hand. The image,
 *              the overlays, the slice label, the metrics and the provenance all
 *              come from `displayed`, so they switch TOGETHER: no new label over
 *              an old image, no old mask over a new slice.
 *
 * Network accounting (L4, NFR-PERF-001 limb 2): every slice request opens a
 * gesture on runtime.netLog and the slice reaching the screen closes it, so
 * each switch writes one CMW_GESTURE line listing every request it caused.
 */
function Explorer({
  runtime, nav, caseId, kase, capability, runId, runReason, initialVariant, initialSlice, onVariantChosen, onChangeRun,
}) {
  const client = runtime.sliceClient || runtime.client;
  const net = runtime.netLog || null;
  const hasRun = typeof runId === 'string' && runId !== '';
  const shape = Array.isArray(kase.shape) ? kase.shape : null;
  const total = shape ? shape[2] : null;
  const width = shape ? shape[0] : null;
  const height = shape ? shape[1] : null;
  const size = useMemo(() => (width && height ? { width, height } : null), [width, height]);
  const options = variantOptions(runtime.contract);
  const noRunText = 'no analysis run for this case';

  const model = useMemo(() => createCaseExplorer(client, { variant: initialVariant }), [client, initialVariant]);
  const [current, setCurrent] = useState(model.current);
  const [shown, setShown] = useState(null);
  const [displayed, setDisplayed] = useState(null);
  const [pending, setPending] = useState(null);
  const [targetVariant, setTargetVariant] = useState(initialVariant);
  const [opacity, setOpacity] = useState(0.5);
  const [tap, setTap] = useState(null);
  const [imageProblem, setImageProblem] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [prepareEpoch, setPrepareEpoch] = useState(0);
  const [runInfo, setRunInfo] = useState(null);
  const [navRun, setNavRun] = useState(null);
  const [fitKey, setFitKey] = useState(0);

  const sample = useRef(null);            // CMW_SLICE timing of the slice in flight
  const seenImages = useRef(new Set());
  const stepWaiter = useRef(null);        // the scripted runs wait on this
  const passRef = useRef(null);
  const displayedRef = useRef(null);
  const overlaysRef = useRef(model.current.overlays);
  const lastLoadedUri = useRef(null);

  const settle = useCallback(() => {
    const c = model.current;
    setCurrent(c);
    overlaysRef.current = c.overlays;
    if (c.view.state === STATE.SUCCESS) {
      // targetVariant is NOT taken from here: a slice answer that lands while
      // a variant switch is queued must not undo the user's choice on screen.
      setShown(c);
      if (sample.current && sample.current.slice === c.sliceIndex && sample.current.tData === null) {
        sample.current.tData = now();
      }
    } else if (c.view.state !== STATE.LOADING) {
      // The gesture ended in a state, not on a slice: close it saying which.
      if (net && net.openSeq !== null) net.end({ outcome: c.view.state });
      if (stepWaiter.current) { const w = stepWaiter.current; stepWaiter.current = null; w.resolve(null); }
    }
  }, [model, net]);

  const runner = useMemo(() => createSerialRunner({
    onSettled: ({ idle }) => { settle(); if (idle) setPending(null); },
    onError: (err) => {
      console.log(`CMW_SCREEN_ERROR ${JSON.stringify({ screen: 'SCR-03', message: String(err && err.message) })}`);
      settle();
    },
  }), [settle]);
  useEffect(() => () => runner.dispose(), [runner]);

  useEffect(() => {
    // #77 QA N-1: an "unavailable" answer cached on an earlier visit is not
    // trusted by a fresh open - the artifact may have been ingested since.
    if (client.clearNegative) client.clearNegative();
    if (net) net.begin({ caseId, from: null, to: initialSlice, kind: 'open' });
    runner.run(() => model.open({ caseId, runId, sliceIndex: initialSlice }));
  }, [runner, model, net, client, caseId, runId, initialSlice]);

  // The run line: run, model family, experiment, precomputed. Read once - and
  // never with no run: a case before its first run asks for no run data.
  useEffect(() => {
    if (!hasRun) { setRunInfo(null); return undefined; }
    let alive = true;
    (async () => {
      const r = await runtime.client.call('analysis_run_get', { run_id: runId });
      if (!alive) return;
      if (r.state !== STATE.SUCCESS) { setRunInfo({ run: { runId }, modelFamily: null, error: r.reason }); return; }
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

  // Where a snapshot's bytes are: each ref's content_url and checksum, as the
  // server stated them. runtime.content resolves and verifies them when the
  // stores fetch; a ref without a content_url is read back from the response
  // the model just fetched (slice cache, no request).
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

  // Bring `shown`'s bytes in, then display it - image, masks and labels at once.
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
    if (u.pred && runtime.maskStore && size) {
      jobs.push(runtime.maskStore.load(u.pred, size, { checksum: u.sums.pred }).catch(() => null));
    }
    if (u.gt && runtime.maskStore && size && overlaysRef.current && overlaysRef.current[LAYER.GROUND_TRUTH]) {
      jobs.push(runtime.maskStore.load(u.gt, size, { checksum: u.sums.gt }).catch(() => null));
    }
    Promise.all(jobs).then((results) => {
      if (!alive) return;
      const failed = results.find((r) => r && r.mri && !r.ok);
      setImageError(failed ? { url: u.mri, message: failed.message } : null);
      displayedRef.current = shown;
      setDisplayed(shown);
      if (net && net.openSeq !== null && net.openTo === shown.sliceIndex) net.end({ outcome: failed ? 'image-error' : 'shown' });
      if (stepWaiter.current && stepWaiter.current.slice === shown.sliceIndex) {
        const w = stepWaiter.current;
        stepWaiter.current = null;
        w.resolve(shown.sliceIndex);
      }
    });
    return () => { alive = false; };
  }, [shown, prepareEpoch, urlsFor, runtime.imageStore, runtime.maskStore, size, net]);

  const goTo = useCallback((n) => {
    if (!Number.isInteger(n) || !Number.isInteger(total)) return;
    const z = Math.max(0, Math.min(total - 1, n));
    const from = displayedRef.current ? displayedRef.current.sliceIndex : null;
    setPending(z);
    if (net) net.begin({ caseId, from, to: z, kind: 'slice' });
    sample.current = {
      slice: z,
      t0: now(),
      tData: null,
      tLoad: null,
      pass: passRef.current,
      metaCached: Boolean(client.has && client.has('mri_slice_get', { case_id: caseId, slice_index: z })),
    };
    runner.run(() => model.goToSlice(z), { key: 'slice' });
  }, [client, caseId, model, net, runner, total]);

  const switchVariant = useCallback((v) => {
    if (!hasRun || v === targetVariant) return;
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

  // Forget what the cache holds for one slice, plus every cached "unavailable"
  // answer (#77 QA N-2). The other slices' answers stay, so a Retry in the
  // middle of a session never turns an L4 revisit pass into network traffic.
  const forgetSlice = useCallback((zz) => {
    if (client.clearNegative) client.clearNegative();
    if (client.clearWhere && Number.isInteger(zz)) {
      client.clearWhere((_ep, p) => p.slice_index === zz && (p.case_id === caseId || (hasRun && p.run_id === runId)));
    }
  }, [client, caseId, hasRun, runId]);

  const refreshSlice = useCallback(() => {
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

  // ----- what is on screen: everything from `displayed` ---------------------
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
  const pred = useMaskOverlay(runtime.maskStore, u.pred, size, u.sums.pred);
  const gt = useMaskOverlay(runtime.maskStore, gtOn ? u.gt : null, size, u.sums.gt);
  const predAvailable = ok && displayed.layersAvailable[LAYER.PREDICTION] === true;
  const gtAvailable = ok && displayed.layersAvailable[LAYER.GROUND_TRUTH] === true && displayed.groundTruthRef !== null;
  const layers = [
    { key: 'gt', path: gt.path, color: OVERLAY_COLOR.GROUND_TRUTH, opacity, visible: !imageProblem && gtOn && gtAvailable },
    { key: 'pred', path: pred.path, color: OVERLAY_COLOR.PREDICTION, opacity, visible: !imageProblem && !switching && overlays[LAYER.PREDICTION] === true && predAvailable },
  ];

  useEffect(() => { setImageProblem(null); }, [imageUri]);

  const finishSample = useCallback((how) => {
    const sm = sample.current;
    if (!sm || sm.slice !== z || sm.tLoad !== null) return;
    sm.tLoad = now();
    requestAnimationFrame(() => {
      const tFrame = now();
      const rec = {
        slice: sm.slice,
        ms_to_data: sm.tData !== null ? +(sm.tData - sm.t0).toFixed(2) : null,
        ms_to_image: +(sm.tLoad - sm.t0).toFixed(2),
        ms_to_frame: +(tFrame - sm.t0).toFixed(2),
        meta_cached: sm.metaCached,
        image_seen_before: seenImages.current.has(u.mri),
        how,
        pass: sm.pass,
        dev: isDev(),
        mode: runtime.mode,
      };
      if (u.mri) seenImages.current.add(u.mri);
      if (sample.current === sm) sample.current = null;
      console.log(`CMW_SLICE ${JSON.stringify(rec)}`);
    });
  }, [z, u.mri, runtime.mode]);

  const onImageLoad = useCallback((e) => {
    lastLoadedUri.current = imageUri;
    const src = e && e.nativeEvent && e.nativeEvent.source;
    if (src && size && Number.isFinite(src.width) && Number.isFinite(src.height)
      && (src.width !== size.width || src.height !== size.height)) {
      setImageProblem(`MRI slice is ${src.width}x${src.height} but the case geometry says ${size.width}x${size.height}; overlays are not drawn over it.`);
    }
    finishSample('image');
  }, [finishSample, size, imageUri]);

  const onImageError = useCallback((e) => {
    setImageProblem(`MRI slice image failed to decode: ${(e && e.nativeEvent && e.nativeEvent.error) || 'unknown error'}`);
    finishSample('image-error');
  }, [finishSample]);

  // No image load to wait for - fixture mode, no content_url, a fetch that
  // failed, or the same image already on screen (an <Image> whose source did
  // not change fires no onLoad): the sample ends when the display does.
  useEffect(() => {
    const sm = sample.current;
    if (!ok || !sm || sm.slice !== z || sm.tData === null) return;
    if (!imageUri) finishSample(imageError ? 'image-error' : 'no-image');
    else if (imageUri === lastLoadedUri.current) finishSample('image-unchanged');
  }, [ok, imageUri, imageError, z, displayed, finishSample]);

  // ----- scripted runs: logcat evidence, nothing computed on the phone --------
  // The timeout belongs to THIS step's waiter, compared by identity: the revisit
  // pass steps back over slices the new pass showed, so an earlier step's timer
  // must never time out a later step that waits on the same slice (#77 QA R-3).
  const stepTo = useCallback((n) => new Promise((resolve) => {
    let timer = null;
    const waiter = { slice: n, resolve: (v) => { clearTimeout(timer); resolve(v); } };
    stepWaiter.current = waiter;
    goTo(n);
    timer = setTimeout(() => {
      if (stepWaiter.current === waiter) {
        stepWaiter.current = null;
        console.log(`CMW_STEP_TIMEOUT ${JSON.stringify({ slice: n, waited_ms: 6000 })}`);
        resolve(null);
      }
    }, 6000);
  }), [goTo]);

  const runScripted = useCallback(async (name, passes, gapMs) => {
    if (!Number.isInteger(total) || navRun) return;
    for (const pass of passes) {
      setNavRun(`${name} ${pass.label}`);
      passRef.current = `${name}:${pass.label}`;
      // has_run / gt_declared / gt_overlay tell the laptop-side judge what every
      // new slice must carry (l4-report.mjs R5): a case with no run is judged
      // on MRI + ground truth and the report says predictions were not in it.
      const ov = overlaysRef.current || {};
      console.log(`CMW_RUN_START ${JSON.stringify({
        run: name, pass: pass.label, steps: pass.steps.length, sequence: pass.steps, nz: total, case_id: caseId,
        run_id: hasRun ? runId : null, variant: hasRun ? targetVariant : null,
        has_run: hasRun, gt_declared: capability.groundTruthUsable, gt_overlay: ov[LAYER.GROUND_TRUTH] === true,
        prediction_overlay: hasRun && ov[LAYER.PREDICTION] === true,
        dev: isDev(), mode: runtime.mode,
      })}`);
      for (const n of pass.steps) {
        await stepTo(n);
        await sleep(gapMs);
      }
      console.log(`CMW_RUN_END ${JSON.stringify({ run: name, pass: pass.label, steps: pass.steps.length })}`);
    }
    passRef.current = null;
    setNavRun(null);
    Alert.alert(`${name} finished`, 'The steps were logged to logcat (CMW_GESTURE, CMW_SLICE, CMW_RUN_*). Nothing is computed on the phone.');
  }, [capability, caseId, hasRun, navRun, runId, runtime.mode, stepTo, targetVariant, total]);

  // L4 (S-1 tonight): 15 slices never seen, then the same 15 back - revisits.
  const runL4 = useCallback(() => {
    const z0 = displayedRef.current ? displayedRef.current.sliceIndex : 0;
    const dir = z0 + 15 <= total - 1 ? 1 : -1;
    const fresh = Array.from({ length: 15 }, (_, i) => z0 + dir * (i + 1));
    const back = Array.from({ length: 15 }, (_, i) => z0 + dir * (14 - i));
    runScripted('L4', [{ label: 'new-15', steps: fresh }, { label: 'revisit-15', steps: back }], 400);
  }, [runScripted, total]);

  // TC-PERF-001: Spike A's A9 30-step sequence, a warm pass then a measured one.
  const runA9 = useCallback(() => {
    const seq = buildNavSequence(total);
    runScripted('A9', [{ label: 'warm', steps: [0, ...seq] }, { label: 'measured', steps: [0, ...seq] }], 350);
  }, [runScripted, total]);

  const askScripted = useCallback(() => {
    Alert.alert(
      'Scripted slice navigation',
      'L4: 15 new slices, then the same 15 revisited (the S-1 gesture check). A9: Spike A\'s 30-step TC-PERF-001 sequence, warm then measured. Timings and bytes go to logcat only.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'A9 30-step', onPress: runA9 },
        { text: 'L4 15 + 15', onPress: runL4 },
      ],
    );
  }, [runA9, runL4]);

  // ----- render ---------------------------------------------------------------
  const run = runInfo ? runInfo.run : { runId };
  // #77 QA B-3: while the viewer shows a state instead of a slice, nothing of
  // the slice that was displayed before may stay on screen as if it were this
  // one - no metric, no provenance, no entry that would carry its index.
  const showing = ok && !blocking;
  const notLoaded = 'this slice did not load';
  let metrics;
  if (blocking) metrics = { text: 'Slice Dice: -', tone: 'neutral' };
  else if (!hasRun) metrics = { text: `Slice Dice: - (${noRunText})`, tone: 'neutral' };
  else if (ok && !switching) metrics = metricsText(displayed.metrics, displayed.variant);
  else metrics = { text: switching ? `Slice Dice: switching to ${targetVariant}…` : 'Slice Dice: -', tone: 'neutral' };
  const scrubIndex = blocking ? current.sliceIndex : (ok ? displayed.sliceIndex : current.sliceIndex);
  const geometryNote = kase.geometry_validation_status === 'GEOMETRY_NOT_VALIDATED'
    ? 'Geometry not validated: index space only - no millimetre values are shown.' : null;
  let pixelNote = null;
  if (runtime.mode === 'fixture') pixelNote = 'Fixture mode: no pixels behind any URL. The grid is the source slice; gestures and states are real.';
  else if (ok && !u.mri) pixelNote = 'This response carries no content_url: no pixels to draw for this slice.';
  else if (imageError) pixelNote = `MRI slice could not be fetched: ${imageError.message}`;
  const needsRun = `needs an analysis run - ${noRunText}`;
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

  return (
    <View style={s.root}>
      <View style={s.head}>
        <View style={s.caseRow}>
          <Text style={s.caseId}>{caseId}</Text>
          <CapabilityBadge capability={capability} />
        </View>
        <Text style={s.runLine} numberOfLines={2}>
          {hasRun ? runText(run, runInfo ? runInfo.modelFamily : null)
            : `No analysis run for this case - MRI${capability.groundTruthUsable ? ' and ground truth' : ''} only`}
          {runReason === 'only-run' ? ' · only run' : ''}
        </Text>
        <View style={s.variantRow}>
          <Text style={s.variantLabel}>Prediction</Text>
          {!hasRun && <Text style={s.dim}>none - {noRunText}</Text>}
          {hasRun && options.map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.variant, targetVariant === v && s.variantOn]}
              onPress={() => switchVariant(v)}
              disabled={Boolean(navRun)}
              accessibilityRole="button"
              accessibilityState={{ selected: targetVariant === v }}
            >
              <Text style={[s.variantT, targetVariant === v && s.variantTOn]}>{v}</Text>
            </TouchableOpacity>
          ))}
          {onChangeRun && (
            <TouchableOpacity style={s.variant} onPress={onChangeRun} accessibilityRole="button">
              <Text style={s.variantT}>Run…</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={s.viewerBox}>
        {blocking ? (
          <View style={s.blocked}>
            <StatePanel view={current.view} what={`slice ${(current.sliceIndex ?? 0) + 1}`} onAction={onStateAction} />
          </View>
        ) : (
          <SliceViewport
            shape={shape}
            imageUri={imageUri}
            onImageLoad={onImageLoad}
            onImageError={onImageError}
            layers={layers}
            placeholderNote={pixelNote}
            resetKey={`${caseId}|${fitKey}`}
            onTap={(src, at) => setTap({ src, slice: z, zoom: at.zoom })}
          />
        )}
      </View>

      <SliceScrubber
        index={scrubIndex}
        pending={pending}
        total={total}
        onChange={goTo}
        onLongPressLabel={askScripted}
        disabled={Boolean(navRun)}
      />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollIn}>
        {navRun && <Text style={s.warn}>Scripted run in progress ({navRun}) - controls are locked.</Text>}
        {imageProblem && <Text style={s.warn}>{imageProblem}</Text>}
        {imageError && (
          <TouchableOpacity style={s.smallBtn} onPress={() => setPrepareEpoch((n) => n + 1)} accessibilityRole="button">
            <Text style={s.smallBtnT}>Fetch the image again</Text>
          </TouchableOpacity>
        )}
        {pixelNote && !blocking ? <Text style={s.dim}>{pixelNote}</Text> : null}

        <View style={s.card}>
          <Text style={s.cardH}>Overlays</Text>
          {hasRun ? (
            <LayerToggle
              label={`Prediction (${ok ? displayed.variant : targetVariant})`}
              swatch={OVERLAY_COLOR.PREDICTION}
              on={overlays[LAYER.PREDICTION] === true}
              available={predAvailable && !switching}
              why={switching ? `switching to ${targetVariant}…` : (pred.status === 'error' ? pred.error : (ok && !predAvailable ? 'not available for this slice' : null))}
              onToggle={(on) => setOverlay(LAYER.PREDICTION, on)}
            />
          ) : (
            <Text style={s.dim}>Prediction: none - {noRunText} (no prediction, metric or error layer).</Text>
          )}
          {capability.groundTruthUsable ? (
            <LayerToggle
              label="Ground truth"
              swatch={OVERLAY_COLOR.GROUND_TRUTH}
              on={gtOn}
              available={gtAvailable}
              why={gt.status === 'error' ? gt.error : (ok && !gtAvailable ? 'not available for this slice' : null)}
              onToggle={(on) => setOverlay(LAYER.GROUND_TRUTH, on)}
            />
          ) : (
            <Text style={s.dim}>Ground truth: none for this case ({capability.label}) - no ground-truth layer, metric or error view is offered.</Text>
          )}
          <View style={s.opacityRow}>
            <Text style={s.dim}>Opacity</Text>
            {OPACITY_STEPS.map((o) => (
              <TouchableOpacity key={o} style={[s.step, opacity === o && s.stepOn]} onPress={() => setOpacity(o)} accessibilityRole="button">
                <Text style={[s.stepT, opacity === o && s.stepTOn]}>{Math.round(o * 100)}%</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.step} onPress={() => setFitKey((k) => k + 1)} accessibilityRole="button">
              <Text style={s.stepT}>Fit</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.card}>
          <Text style={[s.metric, metrics.tone === 'ok' && s.ok, metrics.tone === 'warn' && s.warnT]}>{metrics.text}</Text>
          <TouchableOpacity
            style={[s.smallBtn, navRun && s.toggleOff]}
            onPress={refreshSlice}
            disabled={Boolean(navRun)}
            accessibilityRole="button"
          >
            <Text style={s.smallBtnT}>Refresh this slice</Text>
          </TouchableOpacity>
          {tap && (
            <Text style={s.dim}>
              Tap → source pixel {tap.src ? `(x ${tap.src[0]}, y ${tap.src[1]})` : 'outside the image'} on {sliceLabel(tap.slice, total)} · zoom ×{tap.zoom.toFixed(1)}
            </Text>
          )}
          {geometryNote && <Text style={s.dim}>{geometryNote}</Text>}
        </View>

        <View style={s.card}>
          <Text style={s.cardH}>Provenance (this slice)</Text>
          <Text style={s.mono}>MRI {short(showing && displayed.imageRef ? displayed.imageRef.artifactId : null)} · {short(showing && displayed.imageRef ? displayed.imageRef.checksum : null)}</Text>
          {hasRun ? (
            <Text style={s.mono}>Prediction {showing ? displayed.variant : '-'} {short(showing && displayed.predictionRef ? displayed.predictionRef.artifactId : null)} · {short(showing && displayed.predictionRef ? displayed.predictionRef.checksum : null)}</Text>
          ) : (
            <Text style={s.mono}>Prediction - ({noRunText})</Text>
          )}
          {capability.groundTruthUsable && (
            <Text style={s.mono}>Ground truth {short(showing && displayed.groundTruthRef ? displayed.groundTruthRef.artifactId : null)} · {short(showing && displayed.groundTruthRef ? displayed.groundTruthRef.checksum : null)}</Text>
          )}
        </View>

        <View style={s.entries}>
          <Entry
            label="Error inspector (SCR-04)"
            why={errorEntry}
            onPress={() => nav.push('SCR-04', { caseId, runId, variant: displayed.variant, sliceIndex: z })}
          />
          <Entry label="3D (SCR-05)" why={threeDEntry} onPress={() => nav.push('SCR-05', { caseId, runId, sliceIndex: z })} />
          <Entry
            label="Review / correct (SCR-06)"
            why={reviewEntry}
            onPress={() => nav.push('SCR-06', { runId, caseId, variant: displayed.variant, sliceIndex: z })}
          />
        </View>
        <Text style={s.hint}>Long-press the slice label for the scripted runs (L4, A9) - timings and bytes go to logcat.</Text>
      </ScrollView>
    </View>
  );
}

function LayerToggle({ label, swatch, on, available, why, onToggle }) {
  return (
    <TouchableOpacity
      style={[s.toggle, !available && s.toggleOff]}
      onPress={() => available && onToggle(!on)}
      disabled={!available}
      accessibilityRole="switch"
      accessibilityState={{ checked: on && available, disabled: !available }}
    >
      <View style={[s.swatch, { backgroundColor: swatch }, !(on && available) && s.swatchOff]} />
      <View style={s.toggleText}>
        <Text style={s.toggleLabel}>{label}: {on && available ? 'ON' : 'OFF'}</Text>
        {why ? <Text style={s.dim}>{why}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function Entry({ label, why, onPress }) {
  return (
    <TouchableOpacity
      style={[s.entry, why && s.entryOff]}
      onPress={onPress}
      disabled={Boolean(why)}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(why) }}
    >
      <Text style={[s.entryT, why && s.entryTOff]}>{label}</Text>
      {why ? <Text style={s.dim}>{why}</Text> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.m, paddingTop: space.s },
  head: { gap: 2, marginBottom: space.s },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  caseId: { color: color.text, fontFamily: font.mono, fontSize: font.h2, fontWeight: '700' },
  runLine: { color: color.textDim, fontSize: font.small },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 },
  variantLabel: { color: color.textDim, fontSize: font.small, marginRight: space.xs },
  variant: {
    minHeight: MIN_TOUCH - 8, minWidth: 64, paddingHorizontal: space.s, borderRadius: 6, borderWidth: 1,
    borderColor: color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface,
  },
  variantOn: { borderColor: OVERLAY_COLOR.PREDICTION, backgroundColor: '#2a1d12' },
  variantT: { color: color.textDim, fontFamily: font.mono, fontSize: font.small, fontWeight: '700' },
  variantTOn: { color: OVERLAY_COLOR.PREDICTION },
  viewerBox: { width: '100%', aspectRatio: 1 },
  blocked: { flex: 1, justifyContent: 'center' },
  scroll: { flex: 1, marginTop: space.xs },
  scrollIn: { paddingBottom: space.xl, gap: space.s },
  card: { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 10, padding: space.m, gap: space.xs },
  cardH: { color: color.textDim, fontSize: font.small, fontWeight: '700', letterSpacing: 0.5 },
  toggle: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.s },
  toggleOff: { opacity: 0.55 },
  toggleText: { flex: 1 },
  toggleLabel: { color: color.text, fontSize: font.body, fontWeight: '600' },
  swatch: { width: 18, height: 18, borderRadius: 4 },
  swatchOff: { opacity: 0.35 },
  opacityRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  step: {
    minHeight: 40, minWidth: 52, borderRadius: 6, borderWidth: 1, borderColor: color.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceHi,
  },
  stepOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  stepT: { color: color.textDim, fontSize: font.small, fontWeight: '600' },
  stepTOn: { color: color.accent },
  metric: { color: color.text, fontSize: font.body },
  ok: { color: color.ok },
  warnT: { color: color.warn },
  mono: { color: color.textDim, fontFamily: font.mono, fontSize: 11 },
  entries: { gap: space.s },
  entry: {
    minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.accent, backgroundColor: color.accentBg,
    paddingHorizontal: space.m, paddingVertical: space.s, justifyContent: 'center',
  },
  entryOff: { borderColor: color.border, backgroundColor: color.surface },
  entryT: { color: color.accent, fontSize: font.body, fontWeight: '700' },
  entryTOff: { color: color.textFaint },
  problem: { gap: space.xs },
  smallBtn: {
    alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: space.m, borderRadius: 6, borderWidth: 1,
    borderColor: color.warn, justifyContent: 'center',
  },
  smallBtnT: { color: color.warn, fontSize: font.small, fontWeight: '700' },
  dim: { color: color.textDim, fontSize: font.small },
  warn: { color: color.warn, fontSize: font.small },
  body: { color: color.text, fontSize: font.body },
  hint: { color: color.textFaint, fontSize: 11, textAlign: 'center' },
  h2: { color: color.text, fontSize: font.h2, fontWeight: '700', marginTop: space.l },
  chooser: { padding: space.l, gap: space.s },
  choice: {
    minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface,
    paddingHorizontal: space.m, paddingVertical: space.s, justifyContent: 'center',
  },
  choiceOn: { borderColor: OVERLAY_COLOR.PREDICTION },
  choiceT: { color: color.text, fontFamily: font.mono, fontSize: font.body, fontWeight: '700' },
});
