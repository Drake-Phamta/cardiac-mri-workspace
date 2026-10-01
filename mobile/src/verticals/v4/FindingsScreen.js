/*
 * SCR-08 — Findings (V4, owner Nguyễn Gia Đức Trung).
 *
 * Built on Day 22 under the recovery override as a working skeleton; the
 * owner completes, measures and defends it from Day 23. Everything this file
 * does besides drawing is in findingsController.mjs (node-tested in
 * mobile/test/v4_findings_screen.test.mjs).
 *
 * `10` §3: "Displays findings with evidence context and status. Opening a
 * finding navigates to the strongest available evidence location."
 *   - every finding: type, status, note, and its evidence (case · slice · run);
 *   - Open evidence -> SCR-03 at that exact case and slice (SCR-07 for an
 *     experiment-only record); a record without identifiers says so;
 *   - Review / correct -> SCR-06 for that run, case and slice (it asks for the
 *     variant - a finding records none);
 *   - New finding: only from a case/slice context (FR-FIND-001), i.e. when
 *     SCR-08 was opened from SCR-06's "New finding here" or another screen
 *     with caseId + sliceIndex.
 */

import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { RECOVERY } from '../../../../app/core/index.mjs';
import StateView, { StatePanel } from '../../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import { createFindingsScreen, FINDING_TYPE, PREDICTION_VARIANT } from './findingsController.mjs';

const TYPE_LABEL = Object.freeze({
  UNDER_SEGMENTATION: 'Under-segmentation',
  OVER_SEGMENTATION: 'Over-segmentation',
  BOUNDARY_DISAGREEMENT: 'Boundary disagreement',
  DISCONNECTED_ARTIFACT: 'Disconnected artifact',
  OTHER: 'Other',
});

function Btn({ label, onPress, disabled, active }) {
  return (
    <TouchableOpacity
      style={[s.btn, active && s.btnActive, disabled && s.btnOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active) }}
    >
      <Text style={[s.btnT, active && s.btnTActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function evidenceLine(f) {
  const parts = [];
  if (f.caseId) parts.push(f.caseId);
  if (Number.isInteger(f.sliceIndex)) parts.push(`slice ${f.sliceIndex}`);
  if (f.runId) parts.push(`run ${f.runId}`);
  if (f.variant) parts.push(f.variant);
  if (f.experimentId) parts.push(`exp ${f.experimentId}`);
  if (f.region && f.region.kind === 'POINT') parts.push(`point (${f.region.x}, ${f.region.y})`);
  if (f.region && f.region.kind === 'BOX') parts.push(`box (${f.region.x0}, ${f.region.y0})-(${f.region.x1}, ${f.region.y1})`);
  return parts.length ? parts.join(' · ') : 'no evidence identifiers recorded';
}

function CreateForm({ ctl, st }) {
  const c = st.context;
  return (
    <View style={s.card}>
      <Text style={s.h2}>New finding</Text>
      <Text style={s.mono}>
        {c.caseId} · slice {c.sliceIndex}{c.runId ? ` · run ${c.runId}` : ''}{st.form.variant ? ` · ${st.form.variant}` : ''}
      </Text>
      {st.needsVariant && (
        <View style={s.row}>
          <Text style={s.hint}>Which prediction was on screen?</Text>
          {Object.keys(PREDICTION_VARIANT).map((v) => (
            <Btn key={v} label={v} active={st.form.variant === v} onPress={() => ctl.setVariant(v)} />
          ))}
        </View>
      )}
      <View style={s.row}>
        {Object.keys(FINDING_TYPE).map((t) => (
          <Btn key={t} label={TYPE_LABEL[t]} active={st.form.type === t} onPress={() => ctl.setType(t)} />
        ))}
      </View>
      <TextInput
        style={s.input}
        value={st.form.note}
        onChangeText={(v) => ctl.setNote(v)}
        placeholder="Note (what you see, where)"
        placeholderTextColor={color.textFaint}
        multiline
        accessibilityLabel="Finding note"
      />
      <Btn label={st.busy === 'create' ? 'Saving…' : 'Create finding'} active disabled={!st.canSubmit} onPress={() => ctl.submit()} />
      {!st.form.type && <Text style={s.hint}>Choose a type first.</Text>}
      {st.needsVariant && !st.form.variant && <Text style={s.hint}>Choose the prediction variant (the finding names a run).</Text>}
    </View>
  );
}

export default function FindingsScreen({ runtime, nav, params }) {
  const ctl = useMemo(() => createFindingsScreen({ runtime, params }), [runtime, params]);
  const [, tick] = useReducer((n) => n + 1, 0);
  useEffect(() => ctl.subscribe(tick), [ctl]);
  useEffect(() => { ctl.load(); }, [ctl]);
  const st = ctl.getState();

  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) nav.pop();
    else if (id === RECOVERY.REFRESH || id === RECOVERY.RETRY) ctl.load();
  }, [ctl, nav]);

  const renderItem = ({ item }) => {
    const f = item.finding;
    const open = ctl.routeTo(f.findingId);
    const review = ctl.reviewRouteTo(f.findingId);
    return (
      <View style={s.card}>
        <View style={s.itemHead}>
          <Text style={s.type}>{f.type ? TYPE_LABEL[f.type] || f.type : 'type not recorded'}</Text>
          <Text style={[s.status, f.status === 'RESOLVED' ? s.resolved : s.open]}>{f.status}</Text>
        </View>
        {f.note ? <Text style={s.body}>{f.note}</Text> : null}
        <Text style={s.mono}>{evidenceLine(f)}</Text>
        {!item.ok && item.problems.map((p) => <Text key={p} style={s.problem}>{p}</Text>)}
        <View style={s.row}>
          <Btn label="Open evidence" disabled={!open} onPress={() => nav.push(open.screenId, open.params)} />
          <Btn label={f.status === 'RESOLVED' ? 'Reopen' : 'Resolve'} disabled={!f.revision || Boolean(st.busy)}
            onPress={() => ctl.setStatus(f.findingId, f.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED')} />
          {review && <Btn label="Review / correct" onPress={() => nav.push(review.screenId, review.params)} />}
        </View>
        {!open && <Text style={s.hint}>This finding records no case and slice, so there is no evidence location to open.</Text>}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {st.notice && <Text style={[s.notice, st.notice.kind === 'refused' && s.noticeWarn]}>{st.notice.text}</Text>}
      {st.actionView && (
        <View style={s.banner}><StatePanel view={st.actionView} what="the finding" onAction={onAction} compact /></View>
      )}
      {st.form && <CreateForm ctl={ctl} st={st} />}
      <StateView view={st.view} what="the findings" onAction={onAction}>
        {() => (
          <FlatList
            style={s.flex}
            data={st.items}
            keyExtractor={(item, i) => `${item.finding.findingId || 'finding'}#${i}`}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            ListEmptyComponent={(
              <Text style={s.hint}>
                No findings yet. Create one from a case slice — in Review / Correction, tap "New finding here".
              </Text>
            )}
          />
        )}
      </StateView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  list: { padding: space.m, gap: space.m },
  card: {
    backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 10, padding: space.m,
    gap: space.xs, marginHorizontal: space.m, marginTop: space.m,
  },
  h2: { color: color.text, fontSize: font.h2, fontWeight: '700' },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { color: color.text, fontSize: font.h2, fontWeight: '700' },
  status: { fontFamily: font.mono, fontSize: font.small, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: space.s },
  open: { color: color.warn, borderColor: color.warn },
  resolved: { color: color.ok, borderColor: color.ok },
  body: { color: color.text, fontSize: font.body },
  mono: { color: color.textDim, fontFamily: font.mono, fontSize: font.small },
  problem: { color: color.danger, fontSize: font.small },
  hint: { color: color.textDim, fontSize: font.small, paddingHorizontal: space.m },
  notice: { color: color.ok, fontSize: font.small, paddingHorizontal: space.m, paddingTop: space.s },
  banner: { paddingHorizontal: space.m, paddingTop: space.s },
  noticeWarn: { color: color.warn },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  input: {
    minHeight: 64, color: color.text, borderColor: color.border, borderWidth: 1, borderRadius: 8, padding: space.s,
    fontSize: font.body, textAlignVertical: 'top',
  },
  btn: {
    minHeight: MIN_TOUCH, paddingHorizontal: space.m, borderRadius: 8, borderWidth: 1,
    borderColor: color.border, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center',
  },
  btnActive: { borderColor: color.accent, backgroundColor: color.accentBg },
  btnOff: { opacity: 0.4 },
  btnT: { color: color.text, fontSize: font.body, fontWeight: '600' },
  btnTActive: { color: color.accent },
});
