/*
 * SCR-03 measurement aids: the CMW_SLICE timing of each slice switch and the scripted slice runs (A9, L4) started by
 * a long press on the slice label. They only write logcat lines; the laptop-side reports read them. Nothing here is
 * needed to use the screen.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { buildNavSequence, LAYER } from './cases.mjs';

const now = () => (global.performance ? global.performance.now() : Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDev = () => (typeof __DEV__ !== 'undefined' ? __DEV__ : null);

/*
 * Timing of the slice in flight (CMW_SLICE) and the waiter a scripted step blocks on. The returned object never
 * changes, so the screen can call it from its memoised callbacks.
 */
export function useSliceTiming() {
  const sample = useRef(null);
  const seenImages = useRef(new Set());
  const stepWaiter = useRef(null);
  const passRef = useRef(null);

  return useMemo(() => ({
    stepWaiter,
    passRef,
    startSample(slice, metaCached) {
      sample.current = { slice, t0: now(), tData: null, tLoad: null, pass: passRef.current, metaCached };
    },
    dataArrived(slice) {
      if (sample.current && sample.current.slice === slice && sample.current.tData === null) {
        sample.current.tData = now();
      }
    },
    waitingForImage(slice) {
      const sm = sample.current;
      return Boolean(sm && sm.slice === slice && sm.tData !== null);
    },
    finishSample(how, slice, mriUrl, mode) {
      const sm = sample.current;
      if (!sm || sm.slice !== slice || sm.tLoad !== null) return;
      sm.tLoad = now();
      requestAnimationFrame(() => {
        const tFrame = now();
        const rec = {
          slice: sm.slice,
          ms_to_data: sm.tData !== null ? +(sm.tData - sm.t0).toFixed(2) : null,
          ms_to_image: +(sm.tLoad - sm.t0).toFixed(2),
          ms_to_frame: +(tFrame - sm.t0).toFixed(2),
          meta_cached: sm.metaCached,
          image_seen_before: seenImages.current.has(mriUrl),
          how,
          pass: sm.pass,
          dev: isDev(),
          mode,
        };
        if (mriUrl) seenImages.current.add(mriUrl);
        if (sample.current === sm) sample.current = null;
        console.log(`CMW_SLICE ${JSON.stringify(rec)}`);
      });
    },
    // The slice reached the screen, or the switch ended in a state: release the scripted step waiting on it.
    stepShown(slice) {
      if (stepWaiter.current && stepWaiter.current.slice === slice) {
        const w = stepWaiter.current;
        stepWaiter.current = null;
        w.resolve(slice);
      }
    },
    stepFailed() {
      if (stepWaiter.current) { const w = stepWaiter.current; stepWaiter.current = null; w.resolve(null); }
    },
  }), []);
}

/*
 * The scripted runs. `navRun` names the run in progress (the screen locks its controls meanwhile); `askScripted`
 * opens the dialog that starts one.
 */
export function useScriptedRuns({
  timing, goTo, runtime, net, caseId, runId, hasRun, total, capability, targetVariant, overlaysRef, displayedRef,
}) {
  const [navRun, setNavRun] = useState(null);

  // The timeout belongs to THIS step's waiter, compared by identity: the revisit
  // pass steps back over slices the new pass showed, so an earlier step's timer
  // must never time out a later step that waits on the same slice.
  const stepTo = useCallback((n) => new Promise((resolve) => {
    let timer = null;
    const waiter = { slice: n, resolve: (v) => { clearTimeout(timer); resolve(v); } };
    timing.stepWaiter.current = waiter;
    goTo(n);
    timer = setTimeout(() => {
      if (timing.stepWaiter.current === waiter) {
        timing.stepWaiter.current = null;
        console.log(`CMW_STEP_TIMEOUT ${JSON.stringify({ slice: n, waited_ms: 6000 })}`);
        resolve(null);
      }
    }, 6000);
  }), [goTo, timing]);

  const runScripted = useCallback(async (name, passes, gapMs) => {
    if (!Number.isInteger(total) || navRun) return;
    for (const pass of passes) {
      setNavRun(`${name} ${pass.label}`);
      timing.passRef.current = `${name}:${pass.label}`;
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
      // The session's running totals, so requests that no gesture line lists (none open when they started, or one
      // that had already closed when they ended) are still on record. A line of its own: the laptop-side reports
      // read CMW_RUN_END unchanged.
      if (net) console.log(`CMW_NET_TOTALS ${JSON.stringify({ run: name, pass: pass.label, ...net.totals() })}`);
    }
    timing.passRef.current = null;
    setNavRun(null);
    Alert.alert(`${name} finished`, 'The steps were logged to logcat (CMW_GESTURE, CMW_SLICE, CMW_RUN_*, CMW_NET_TOTALS). Nothing is computed on the phone.');
  }, [capability, caseId, hasRun, navRun, net, overlaysRef, runId, runtime.mode, stepTo, targetVariant, timing, total]);

  // L4: 15 slices never seen, then the same 15 back - revisits.
  const runL4 = useCallback(() => {
    const z0 = displayedRef.current ? displayedRef.current.sliceIndex : 0;
    const dir = z0 + 15 <= total - 1 ? 1 : -1;
    const fresh = Array.from({ length: 15 }, (_, i) => z0 + dir * (i + 1));
    const back = Array.from({ length: 15 }, (_, i) => z0 + dir * (14 - i));
    runScripted('L4', [{ label: 'new-15', steps: fresh }, { label: 'revisit-15', steps: back }], 400);
  }, [displayedRef, runScripted, total]);

  // TC-PERF-001: the 30-step sequence measured in the 2D prototype, a warm pass then a measured one.
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

  return { navRun, askScripted };
}
