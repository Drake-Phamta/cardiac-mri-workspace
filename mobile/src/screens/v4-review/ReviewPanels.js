// The review sheet of SCR-06 (it opens from the status tag over the picture and from the app bar's "more"): the
// review's status as a row, the actions that change it (Accept, Flag, Not reviewed), the box that asks why before a
// flag, the history as rows, the edits and the view (Cancel edits, zoom), and "New finding here".
// What each does is decided by the controller (ctl) and the model (review.mjs); this only draws and forwards taps.
// A button that is off says why in a quiet line next to it.

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { RECOVERY, STATE } from '../../api/states.mjs';
import { Button, IconButton, Tag } from '../../components/Controls';
import ListRow, { SectionLabel } from '../../components/ListRow';
import { StatePanel } from '../../components/StateView';
import { color, HAIRLINE, radius, space, type } from '../../components/theme';
import { statusWord } from './format.mjs';
import NoteCheck from './NoteCheck';
import { statusHint } from './review.mjs';
import { IconFit, IconZoomIn, IconZoomOut } from './toolIcons';

// The buttons that change the status. CORRECTED is not one of them: only a save reaches it.
const ACTION_LABEL = Object.freeze({ ACCEPTED: 'Accept', FLAGGED: 'Flag', NOT_REVIEWED: 'Not reviewed' });

// Flag asks why first. The reason is checked like a note: required, at most 500 characters, and a warning when
// it may hold a personal detail.
function FlagBox({ ctl, flag, transition, writable, ask }) {
  const send = () => {
    if (transition && transition.confirm) {
      ask({
        title: 'Flag?',
        lines: ['This review was Accepted. Flagging it keeps the earlier decision in the review history.'],
        okLabel: 'Flag',
        onOk: () => ctl.submitFlag({ confirmed: true }),
      });
    } else ctl.submitFlag();
  };
  return (
    <View style={s.flag} testID="flag-box">
      <Text style={s.flagAsk}>Why flag this prediction?</Text>
      <TextInput
        style={s.input}
        value={flag.text}
        onChangeText={(v) => ctl.setFlagReason(v)}
        placeholder="What is wrong on the image, and where (required)"
        placeholderTextColor={color.t3}
        multiline
        accessibilityLabel="Flag reason"
      />
      <NoteCheck check={flag.check} />
      {flag.check.empty ? <Text style={s.hint} testID="flag-why">A flag needs a reason: say what is wrong first.</Text> : null}
      <View style={s.buttons}>
        <Button label="Cancel" variant="secondary" onPress={() => ctl.cancelFlag()} />
        <Button label={flag.check.warnings.length ? 'Flag anyway' : 'Flag with this reason'}
          disabled={!flag.canSubmit || !writable} onPress={send} />
      </View>
    </View>
  );
}

// Who changed the review, what and when, newest first, one row each. The reviewer is the project alias the server
// recorded. The mask id and the full time of an entry are in the Details sheet.
function HistoryRows({ ctl, history }) {
  const failed = history.view && history.view.state !== STATE.SUCCESS;
  return (
    <View testID="history">
      {!history.view && <Text style={s.hint}>Loading the history…</Text>}
      {failed && (
        <StatePanel view={history.view} what="the review history" compact
          onAction={(id) => (id === RECOVERY.BACK ? ctl.toggleHistory() : ctl.retryHistory())} />
      )}
      {history.lines.map((l) => (
        <View key={l.key} style={s.event}>
          <View style={s.eventHead}>
            <Text style={s.eventWhat}>{l.what}</Text>
            <Text style={s.eventWhen}>{l.short}</Text>
          </View>
          {l.reason && <Text style={s.eventReason}>Reason: {l.reason}</Text>}
          <Text style={s.eventWho}>{l.who}</Text>
        </View>
      ))}
      {history.view && !failed && history.lines.length === 0 && <Text style={s.hint}>Nothing recorded yet.</Text>}
    </View>
  );
}

// st: the controller's state; guarded: the shell lets this screen ask before it is left;
// onNewFinding: opens SCR-08 with this slice; ask: the screen's Cancel / OK sheet.
export default function ReviewSheetBody({ ctl, st, guarded, onNewFinding, ask }) {
  const r = st.review;
  const writable = r.canWrite && !st.busy;
  const askStatus = (t) => {
    if (t.confirm) {
      ask({
        title: `${ACTION_LABEL[t.to]}?`,
        lines: [`This review was Accepted. Changing it to ${statusWord(t.to)} keeps the earlier decision in the history.`],
        okLabel: ACTION_LABEL[t.to],
        onOk: () => ctl.setStatus(t.to, { confirmed: true }),
      });
    } else ctl.setStatus(t.to);
  };
  const flagTransition = r.transitions.find((t) => t.to === 'FLAGGED');
  const hint = statusHint(r.status, r.canWrite);
  const noEdits = st.brush.unsavedSlices.length === 0;
  // why Cancel edits is off: nothing to cancel, or the slice cannot be edited (its reason)
  const cancelWhy = !st.canEdit ? st.why.edit : (noEdits ? 'No unsaved edits to cancel.' : null);
  return (
    <>
      <View style={s.section}>
        <ListRow
          variant="nav"
          title="Status"
          divider="both"
          testID="review-status-row"
          trailing={<View><Tag label={statusWord(r.status)} tone={r.status === 'FLAGGED' ? 'warn' : 'neutral'} /></View>}
        />
        <View style={s.buttons}>
          {r.transitions.filter((t) => ACTION_LABEL[t.to]).map((t) => (
            <Button key={t.to} label={ACTION_LABEL[t.to]} variant={t.to === 'FLAGGED' && st.flag ? 'primary' : 'secondary'}
              disabled={!writable || !t.ok} onPress={() => (t.to === 'FLAGGED' ? ctl.startFlag() : askStatus(t))} />
          ))}
        </View>
        {hint ? <Text style={s.hint} testID="status-hint">{hint}</Text> : null}
        {st.flag && <FlagBox ctl={ctl} flag={st.flag} writable={writable} transition={flagTransition} ask={ask} />}
      </View>

      <View style={s.section}>
        <SectionLabel title="History" />
        <HistoryRows ctl={ctl} history={st.history} />
      </View>

      <View style={s.section}>
        <SectionLabel title="Edits and view" />
        <View style={s.buttons}>
          <Button label="Cancel edits" variant="secondary" disabled={!st.canEdit || noEdits}
            onPress={() => ask({
              title: 'Discard unsaved edits?',
              lines: ['The working mask goes back to the last save (or the source).'],
              okLabel: 'Discard',
              onOk: () => ctl.cancel(),
            })} />
          <View style={s.grow} />
          <IconButton icon={IconZoomOut} label="Zoom out" tint={color.t1} onPress={() => ctl.zoomBy(0.5)} />
          <IconButton icon={IconFit} label="Fit" tint={color.t1} onPress={() => ctl.fitView()} />
          <IconButton icon={IconZoomIn} label="Zoom in" tint={color.t1} onPress={() => ctl.zoomBy(2)} />
        </View>
        {cancelWhy ? <Text style={s.hint} testID="cancel-edits-why">{cancelWhy}</Text> : null}
      </View>

      <View style={s.section}>
        <View style={s.buttons}>
          <Button label="New finding here" variant="quiet" disabled={!guarded && !st.canLeave} onPress={onNewFinding} />
        </View>
        {!guarded && !st.canLeave && <Text style={s.hint}>{st.leaveBlockedReason}</Text>}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  section: { gap: space.s },
  grow: { flex: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s },
  hint: { ...type.caption, color: color.t3 },
  flag: { gap: space.s, paddingVertical: space.s },
  flagAsk: { ...type.body, fontWeight: '500', color: color.t1 },
  input: {
    minHeight: 72, ...type.body, color: color.t1, backgroundColor: color.field, borderRadius: radius.m,
    paddingHorizontal: space.m, paddingVertical: space.m, textAlignVertical: 'top',
  },
  event: { paddingVertical: space.s, gap: 2, borderBottomWidth: HAIRLINE, borderColor: color.hair },
  eventHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.m },
  eventWhat: { ...type.body, color: color.t1, flexShrink: 1 },
  eventWhen: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
  eventReason: { ...type.secondary, lineHeight: 18, color: color.t2 },
  eventWho: { ...type.caption, color: color.t3 },
});
