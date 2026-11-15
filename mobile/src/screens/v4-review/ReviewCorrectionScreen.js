// SCR-06 Review / Correction, Direction A "Clinical viewer": the picture fills the screen under the shell's floating
// app bar (case, "Raw prediction", the privacy shield, Info, "more"); over it the review's status as a tag, the drawing
// tools as a column, and the bottom panel (Slice 45 / 88, Reset, Save, brush size). Ids, revisions and checksums go to
// the Details sheet behind Info; the review itself (status, history) is a sheet behind the status tag and "more".
// The logic is in reviewScreen.mjs; this file fetches what the controller asks for (the readers), keeps the leave
// guard, tells the shell what to show in its bar (nav.setContext) and puts the parts together. The screen shows the
// MRI and the masks, so it has Privacy mode like SCR-03 and SCR-04: on by default, the shield in the bar.

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RECOVERY, STATE } from '../../api/states.mjs';
import { decodeMaskPng } from '../../lib/maskPng';
import { PRIVACY, privacyText } from '../../lib/privacy.mjs';
import { usePrivacyMode } from '../../lib/screenCapture';
import { sliceParts } from '../../lib/sliceNumber.mjs';
import { useCall } from '../../api/RuntimeContext';
import { Button } from '../../components/Controls';
import { Sheet } from '../../components/DetailsSheet';
import { IconShield } from '../../components/icons';
import StateView, { StatePanel } from '../../components/StateView';
import { color, radius, size, space, type } from '../../components/theme';
import { CHROME } from '../../navigation/routes.mjs';
import useConfirm from './confirm';
import { statusWord } from './format.mjs';
import ReviewCanvas, { PANEL_HEIGHT } from './ReviewCanvas';
import { reviewDetailSections } from './reviewDetails.mjs';
import ReviewPanel from './ReviewPanel';
import ReviewSheetBody from './ReviewPanels';
import { createReviewScreen, PHASE } from './reviewScreen.mjs';
import ToolColumn from './ReviewTools';

// The readers draw nothing: each fetches what the controller asks for and hands the answer back.
// They are keyed by what they fetch, so an answer can never be handed in for the wrong slice.
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

// The review's history, read only while the review sheet is open (review_history_list, contract 1.2.0).
function HistoryReader({ ctl, client, want }) {
  const { view } = useCall(client, 'review_history_list', { review_id: want.reviewId });
  useEffect(() => { if (view.state !== STATE.LOADING) ctl.provideHistory(want.revision, view); }, [view, ctl, want.revision]);
  return null;
}

const VARIANT_WORD = Object.freeze({ RAW: 'Raw', PROCESSED: 'Processed' });

export default function ReviewCorrectionScreen({ runtime, nav, params }) {
  // One AbortController per screen instance: unmounting aborts a byte fetch still in flight.
  const life = useMemo(() => (typeof AbortController === 'function' ? new AbortController() : null), [runtime, params]);
  const ctl = useMemo(
    () => createReviewScreen({ runtime, params, decodeMaskPng, signal: life ? life.signal : null }),
    [runtime, params, life],
  );
  const client = runtime.client;
  const [, tick] = useReducer((n) => n + 1, 0);
  const [reviewOpen, setReviewOpen] = useState(false);
  // The bottom panel's measured height: its rows wrap on a narrow screen or at a large font, so it is not always 137 dp.
  const [panelH, setPanelH] = useState(PANEL_HEIGHT);
  // Privacy mode (on by default, remembered for the session): screenshots and casting of this screen show black.
  const privacy = usePrivacyMode('SCR-06');
  // Every Cancel / OK question of this screen is one sheet, drawn once at the bottom of the screen.
  const [ask, question] = useConfirm();
  useEffect(() => ctl.subscribe(tick), [ctl]);
  useEffect(() => { ctl.start(); }, [ctl]);
  useEffect(() => () => { if (life) life.abort(); }, [life]);
  const st = ctl.getState();
  const ready = st.phase === PHASE.READY;

  // The history is read only while the review sheet is open.
  useEffect(() => {
    if (ready && ctl.getState().history.open !== reviewOpen) ctl.toggleHistory();
  }, [ready, reviewOpen, ctl]);

  // A covered screen unmounts in this navigator, so leaving would drop unsaved edits.
  // While a slice is unsaved, every way off the screen (Back, Android back, a tab, a push) asks first.
  const guarded = typeof nav.setLeaveGuard === 'function';
  useEffect(() => {
    if (!guarded) return;
    if (st.canLeave) { nav.setLeaveGuard(null); return; }
    // Every way to dismiss the question (the close button, back, a tap outside) is "Stay", so the guard always settles.
    nav.setLeaveGuard(() => new Promise((resolve) => {
      ask({
        title: 'Unsaved edits',
        lines: [ctl.getState().leaveBlockedReason, 'Leave anyway?'],
        cancelLabel: 'Stay',
        okLabel: 'Discard and leave',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    }));
  }, [guarded, st.canLeave, nav, ctl, ask]);

  // What the shell's floating app bar and Details sheet show. The bar names the case and the prediction, never a run
  // id; the ids, revisions and checksums are the Details sections. The shell compares this report shallowly, so the
  // sections and the "more" button are memoized.
  const openReview = useCallback(() => setReviewOpen(true), []);
  const overflow = useMemo(() => (ready ? { label: 'Review: status, history, edits and view', onPress: openReview } : null), [ready, openReview]);
  const priv = privacyText(privacy.status, privacy.on);
  const actions = useMemo(() => [{
    key: 'privacy', icon: IconShield, label: priv.title, active: privacy.status === PRIVACY.PROTECTED, onPress: privacy.toggle,
  }], [priv.title, privacy.status, privacy.toggle]);
  const sections = [...(ready ? reviewDetailSections(st) : []), { title: 'Privacy', lines: [priv.title, priv.detail].filter(Boolean) }];
  const sectionsKey = JSON.stringify(sections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = useMemo(() => sections, [sectionsKey]);
  const caseId = (st.target && st.target.caseId) || params.caseId || null;
  const variant = (st.target && st.target.variant) || params.variant || null;
  let subtitle = 'Opening the review';
  if (st.phase === PHASE.CHOOSE_VARIANT) subtitle = 'Choose a prediction';
  else if (st.phase === PHASE.BLOCKED) subtitle = 'Review not available';
  // No " · review": "Raw prediction · review" did not fit beside the shield, Info and "more" on a 320 dp screen.
  else if (ready) subtitle = `${VARIANT_WORD[variant] || variant} prediction`;
  useEffect(() => {
    if (typeof nav.setContext !== 'function') return;
    nav.setContext({ title: caseId || 'Review / Correction', subtitle, actions, overflow, details });
  }, [nav, caseId, subtitle, actions, overflow, details]);
  useEffect(() => () => { if (typeof nav.setContext === 'function') nav.setContext(null); }, [nav]);

  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) {
      // With a leave guard the navigator asks; without one, never leave while a slice is unsaved.
      const now = ctl.getState();
      if (guarded || now.canLeave) nav.pop();
      else ctl.say(now.leaveBlockedReason);
    } else if (id === RECOVERY.REFRESH || id === RECOVERY.RETRY) ctl.refresh();
  }, [ctl, nav, guarded]);

  if (st.phase === PHASE.CHOOSE_VARIANT) {
    return (
      <View style={s.pad}>
        <Text style={s.h1}>Which prediction do you want to review?</Text>
        <Text style={s.body}>A review covers one prediction. Choose the one you want to correct; the app never picks one for you.</Text>
        <View style={s.stack}>
          <Button label="RAW prediction" block onPress={() => ctl.chooseVariant('RAW')} testID="variant-RAW" />
          <Button label="PROCESSED prediction" variant="secondary" block onPress={() => ctl.chooseVariant('PROCESSED')} testID="variant-PROCESSED" />
        </View>
      </View>
    );
  }
  const readers = (
    <>
      {st.wants.run && <RunReader key={`run#${st.wants.run.epoch}`} ctl={ctl} client={client} runId={st.wants.run.runId} />}
      {st.wants.slice && <SliceReader key={`slice#${st.wants.slice.ticket}`} ctl={ctl} client={client} want={st.wants.slice} />}
      {st.wants.history && (
        <HistoryReader key={`history#${st.wants.history.reviewId}#${st.wants.history.revision}`} ctl={ctl} client={client}
          want={st.wants.history} />
      )}
    </>
  );
  if (!ready) {
    return (
      <View style={s.underBar}>
        {readers}
        <StateView view={st.blockedView} what="the review" onAction={onAction} />
      </View>
    );
  }

  const r = st.review;
  const b = st.brush;
  const src = b.source;

  // The question says what changes in plain words. No id: the source mask and the review are in the Details sheet.
  const askSave = () => {
    const slices = b.unsavedSlices.map((z) => sliceParts(z, st.slice.total).current);
    const lines = [
      `${statusWord(r.status)} → Corrected`,
      `${slices.length === 1 ? 'Slice' : 'Slices'} ${slices.join(', ')}`,
      'The source prediction is never changed.',
    ];
    if (r.status === 'ACCEPTED') lines.push('The earlier decision stays in the review history.');
    if (src.synthetic) lines.push({ text: 'Fixture mode: the mask is a stand-in, not a prediction.', tone: 'warn' });
    ask({
      title: 'Save correction?',
      lines,
      okLabel: 'Save',
      onOk: () => ctl.save({ confirmed: r.status === 'ACCEPTED' }),
    });
  };
  const newFinding = () => {
    setReviewOpen(false);
    nav.push('SCR-08', {
      caseId: st.target.caseId, runId: st.target.runId, variant: st.target.variant, sliceIndex: st.slice.index,
      experimentId: st.target.experimentId,
    }, {
      // Back reopens this review on the variant and slice that were on screen.
      caseId: st.target.caseId, variant: st.target.variant, sliceIndex: st.slice.index,
    });
  };

  return (
    <View style={s.root}>
      {readers}
      <ReviewCanvas ctl={ctl} st={st} onStatus={openReview} bottomInset={panelH} />
      {r.view.state !== STATE.SUCCESS && (
        <View style={s.banner}><StatePanel view={r.view} what="the review" onAction={onAction} compact /></View>
      )}
      <ToolColumn ctl={ctl} st={st} style={[s.tools, { bottom: panelH + space.l }]} />
      <ReviewPanel ctl={ctl} st={st} onSave={askSave} ask={ask} onHeight={setPanelH} />

      <Sheet visible={reviewOpen} onClose={() => setReviewOpen(false)} title="Review" testID="review-sheet">
        <ReviewSheetBody ctl={ctl} st={st} guarded={guarded} onNewFinding={newFinding} ask={ask} />
      </Sheet>
      {question}
    </View>
  );
}

// The shell draws the app bar over this screen (viewer chrome) and hides the tab bar.
ReviewCorrectionScreen.chrome = CHROME.VIEWER;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.viewer },
  // the shell's floating bar covers the top 56 dp of a viewer-chrome screen
  underBar: { flex: 1, paddingTop: size.appBar, backgroundColor: color.bg },
  pad: { flex: 1, paddingTop: size.appBar + space.l, paddingHorizontal: space.l, gap: space.m, backgroundColor: color.bg },
  h1: { ...type.screenTitle, color: color.t1 },
  body: { ...type.body, color: color.t2 },
  stack: { gap: space.s, marginTop: space.s },
  banner: {
    position: 'absolute', left: space.l, right: space.l, top: size.appBar + 2 * 48, padding: space.m, borderRadius: radius.m,
    backgroundColor: color.glassPanel,
  },
  tools: { position: 'absolute', right: space.l },
});
