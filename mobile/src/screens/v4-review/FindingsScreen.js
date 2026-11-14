// SCR-08 Findings: lists findings newest first with their status and evidence (case, slice, run), filters them
// by status and type, exports the list shown as a PDF, opens the evidence location, and creates a new finding when
// opened from a case slice. The logic is in findings.mjs; this file reads the list with useCall, hands it to the
// controller and draws its state.

import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { RECOVERY } from '../../api/states.mjs';
import { useCall } from '../../api/RuntimeContext';
import StateView, { StatePanel } from '../../components/StateView';
import { color, font, MIN_TOUCH, radius, space } from '../../components/theme';
import {
  ALL, createFindingsScreen, evidenceLine, FINDING_TYPE, STATUS_LABEL, TYPE_LABEL, typeLabel,
} from './findings.mjs';
import NoteCheck from './NoteCheck';
import { pdfPrinter } from './pdfExport';
import { PREDICTION_VARIANT } from '../../lib/caseMode.mjs';

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

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
    >
      <Text style={[s.chipT, active && s.chipTActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Above the list: the filter chips (each with its count over the whole list) and Export PDF.
function ListTools({ ctl, st }) {
  const { counts, filter } = st;
  return (
    <View style={s.tools}>
      <View style={s.chips}>
        <Text style={s.chipsLabel}>Status</Text>
        <Chip label={`All (${counts.all})`} active={filter.status === ALL} onPress={() => ctl.setFilter({ status: ALL })} />
        {Object.keys(STATUS_LABEL).map((k) => (
          <Chip key={k} label={`${STATUS_LABEL[k]} (${counts.status[k]})`} active={filter.status === k}
            onPress={() => ctl.setFilter({ status: k })} />
        ))}
      </View>
      <View style={s.chips}>
        <Text style={s.chipsLabel}>Type</Text>
        <Chip label="All types" active={filter.type === ALL} onPress={() => ctl.setFilter({ type: ALL })} />
        {Object.keys(FINDING_TYPE).map((k) => (
          <Chip key={k} label={`${TYPE_LABEL[k]} (${counts.type[k]})`} active={filter.type === k}
            onPress={() => ctl.setFilter({ type: k })} />
        ))}
      </View>
      <View style={s.exportRow}>
        <Text style={s.shownT}>{st.shown.length} of {counts.all} shown · newest first</Text>
        <Btn label={st.busy === 'export' ? 'Opening…' : 'Export PDF'} disabled={!st.pdfAvailable || Boolean(st.busy)}
          onPress={() => ctl.exportPdf()} />
      </View>
      <Text style={s.hint}>
        {st.pdfAvailable
          ? 'The PDF lists the findings shown: case IDs, slices, types and notes, no image.'
          : 'Export PDF needs the next app build (expo-print). Everything else works.'}
      </Text>
    </View>
  );
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
        placeholder="Note: what you see on the image, and where"
        placeholderTextColor={color.textFaint}
        multiline
        accessibilityLabel="Finding note"
      />
      <NoteCheck check={st.noteCheck} />
      <Btn
        label={st.busy === 'create' ? 'Saving…' : st.noteCheck.warnings.length ? 'Create anyway' : 'Create finding'}
        active
        disabled={!st.canSubmit}
        onPress={() => ctl.submit()}
      />
      {!st.form.type && <Text style={s.hint}>Choose a type first.</Text>}
      {st.needsVariant && !st.form.variant && <Text style={s.hint}>Choose the prediction variant (the finding names a run).</Text>}
    </View>
  );
}

export default function FindingsScreen({ runtime, nav, params }) {
  const ctl = useMemo(() => createFindingsScreen({ runtime, params, printer: pdfPrinter }), [runtime, params]);
  const [, tick] = useReducer((n) => n + 1, 0);
  useEffect(() => ctl.subscribe(tick), [ctl]);
  const list = useCall(runtime.client, 'findings_list', {});
  useEffect(() => { ctl.provideList(list.view); }, [list.view, ctl]);
  const st = ctl.getState();
  const refetch = list.refetch;

  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) nav.pop();
    else if (id === RECOVERY.REFRESH || id === RECOVERY.RETRY) refetch();
  }, [refetch, nav]);

  const renderItem = ({ item }) => {
    const f = item.finding;
    const open = ctl.routeTo(f.findingId);
    const review = ctl.reviewRouteTo(f.findingId);
    return (
      <View style={s.card}>
        <View style={s.itemHead}>
          <Text style={s.type}>{typeLabel(f.type)}</Text>
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
            data={st.shown}
            keyExtractor={(item, i) => `${item.finding.findingId || 'finding'}#${i}`}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            ListHeaderComponent={<ListTools ctl={ctl} st={st} />}
            ListEmptyComponent={(
              <Text style={s.hint}>
                {st.counts.all === 0
                  ? 'No findings yet. Create one from a case slice — in Review / Correction, tap "New finding here".'
                  : 'No finding matches these filters.'}
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
    minHeight: 64, color: color.text, borderColor: color.control, borderWidth: 1, borderRadius: 8, padding: space.s,
    fontSize: font.body, textAlignVertical: 'top',
  },
  btn: {
    minHeight: MIN_TOUCH, paddingHorizontal: space.m, borderRadius: 8, borderWidth: 1,
    borderColor: color.control, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center',
  },
  tools: { gap: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chipsLabel: { color: color.textDim, fontSize: font.small, minWidth: 44 },
  chip: {
    minHeight: MIN_TOUCH, paddingHorizontal: space.m, borderRadius: radius.pill, borderWidth: 1, borderColor: color.control,
    justifyContent: 'center',
  },
  chipActive: { borderColor: color.accent, backgroundColor: color.accentBg },
  chipT: { color: color.text, fontSize: font.small, fontVariant: font.numeric },
  chipTActive: { color: color.accent, fontWeight: '700' },
  exportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  shownT: { color: color.textDim, fontSize: font.small, fontVariant: font.numeric, flexShrink: 1 },
  btnActive: { borderColor: color.accent, backgroundColor: color.accentBg },
  btnOff: { opacity: 0.4 },
  btnT: { color: color.text, fontSize: font.body, fontWeight: '600' },
  btnTActive: { color: color.accent },
});
