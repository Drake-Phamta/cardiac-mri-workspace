// SCR-08 Findings, Direction A: a dense list of findings (newest first), filter tabs for the status and chips for
// the type, Export PDF, and a sheet for one finding with its actions and, in full, its ids. A finding is created
// from a case slice (the route carries the case and slice, for example from SCR-06). The logic is in
// findings.mjs; this file reads the list with useCall, hands it to the controller and draws its state.

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { RECOVERY } from '../../api/states.mjs';
import { useCall } from '../../api/RuntimeContext';
import { Button, SegmentedControl, Tag } from '../../components/Controls';
import { DetailLine, Sheet } from '../../components/DetailsSheet';
import { IconAlert, IconChevronRight } from '../../components/icons';
import { SectionLabel } from '../../components/ListRow';
import StateView, { StatePanel } from '../../components/StateView';
import { color, HAIRLINE, MIN_TOUCH, radius, space, type } from '../../components/theme';
import {
  ALL, createFindingsScreen, detailLines, FINDING_TYPE, STATUS_LABEL, TYPE_LABEL, typeLabel, whereLine,
} from './findings.mjs';
import { placeLine, sliceNumber } from './format.mjs';
import Notice from './Notice';
import NoteCheck from './NoteCheck';
import { pdfPrinter } from './pdfExport';
import { PREDICTION_VARIANT } from '../../lib/caseMode.mjs';

// Touch areas of 48 dp around a smaller look: a 32 dp chip pads 8 above and below; a tab is 48 dp high by itself
// (a hitSlop above the first row of a list would fall outside the list) and pads 4 either side.
const CHIP_SLOP = { top: 8, bottom: 8, left: 0, right: 0 };
const TAB_SLOP = { top: 0, bottom: 0, left: 4, right: 4 };

// An open finding is the one that needs attention (amber); a resolved one is quiet. Always in words too.
const statusTag = (status) => <Tag label={STATUS_LABEL[status] || 'No status'} tone={status === 'OPEN' ? 'warn' : 'neutral'} />;

// All 3 | Open 2 | Resolved 1: text tabs with a muted count, the selected one underlined (the case list's tabs).
function FilterTabs({ counts, value, onChange }) {
  const tabs = [{ key: ALL, label: 'All', n: counts.all }]
    .concat(Object.keys(STATUS_LABEL).map((k) => ({ key: k, label: STATUS_LABEL[k], n: counts.status[k] })));
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, on && s.tabOn]}
            onPress={() => onChange(t.key)}
            hitSlop={TAB_SLOP}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.tabT, on && s.tabTOn]}>{t.label} <Text style={s.tabN}>{t.n}</Text></Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// One type, as a chip: "Under-segmentation 1". The selected chip is accent on accent-soft, as a selected segment is.
// The chip is 32 dp high; hitSlop makes its touch area 48 dp, and the rows of a wrapped group are 16 dp apart (rowGap
// in `chips`) so the areas of two rows never overlap.
function TypeChip({ label, count = null, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, selected && s.chipOn]}
      onPress={onPress}
      hitSlop={CHIP_SLOP}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[s.chipT, selected && s.chipTOn]}>
        {label}{count === null ? '' : ' '}{count === null ? null : <Text style={s.chipN}>{count}</Text>}
      </Text>
    </TouchableOpacity>
  );
}

// Above the list: the status tabs, the type chips (each with its count over the whole list) and Export PDF.
function ListTools({ ctl, st }) {
  const { counts, filter } = st;
  return (
    <View>
      <FilterTabs counts={counts} value={filter.status} onChange={(status) => ctl.setFilter({ status })} />
      {/* The chips wrap into lines: nothing is cut at the edge and nothing needs a scroll to be found. */}
      <View style={s.chips} testID="type-chips">
        <TypeChip label="All types" selected={filter.type === ALL} onPress={() => ctl.setFilter({ type: ALL })} />
        {Object.keys(FINDING_TYPE).map((k) => (
          <TypeChip key={k} label={TYPE_LABEL[k]} count={counts.type[k]} selected={filter.type === k}
            onPress={() => ctl.setFilter({ type: k })} />
        ))}
      </View>
      <View style={s.control}>
        <Text style={s.shown}>{st.shown.length} of {counts.all} shown · newest first</Text>
        <Button label={st.busy === 'export' ? 'Opening…' : 'Export PDF'} variant="secondary"
          disabled={!st.pdfAvailable || Boolean(st.busy)} onPress={() => ctl.exportPdf()} />
      </View>
      <Text style={s.hint}>
        {st.pdfAvailable
          ? 'The PDF lists the findings shown: case IDs, slices, types and notes, no image.'
          : 'PDF export is not available in this version of the app.'}
      </Text>
    </View>
  );
}

// One finding: its type and status, where it is, and the start of the note. Tap for the sheet.
function FindingRow({ item, onPress }) {
  const f = item.finding;
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel(f.type)}, ${STATUS_LABEL[f.status] || 'no status'}, ${whereLine(f)}`}
    >
      <View style={s.rowBody}>
        <View style={s.rowHead}>
          <Text style={s.rowType} numberOfLines={1}>{typeLabel(f.type)}</Text>
          {statusTag(f.status)}
          {!item.ok ? <IconAlert size={16} strokeWidth={2} color={color.danger} /> : null}
        </View>
        <Text style={s.rowWhere}>{whereLine(f)}</Text>
        {f.note ? <Text style={s.rowNote} numberOfLines={2}>{f.note}</Text> : null}
      </View>
      <IconChevronRight size={16} color={color.t3} />
    </TouchableOpacity>
  );
}

// One finding in full: the whole note, what can be done with it, and every id (the only place they are written: the
// Details part at the bottom; above it the sheet names the experiment by its label).
function FindingSheet({ item, ctl, st, nav, onClose }) {
  const f = item ? item.finding : null;
  const open = f ? ctl.routeTo(f.findingId) : null;
  const review = f ? ctl.reviewRouteTo(f.findingId) : null;
  const go = (route) => { onClose(); nav.push(route.screenId, route.params); };
  return (
    <Sheet visible={Boolean(f)} onClose={onClose} title={f ? typeLabel(f.type) : ''} testID="finding-sheet">
      {f ? (
        <>
          <View style={s.sheetTop}>
            <View style={s.rowHead}>{statusTag(f.status)}</View>
            <Text style={s.sheetWhere} testID="finding-where">{whereLine(f)}</Text>
            {f.note ? <Text style={s.sheetNote} selectable>{f.note}</Text> : <Text style={s.hint0}>No note.</Text>}
            {!item.ok ? item.problems.map((p) => <Text key={p} style={s.problem}>{p}</Text>) : null}
          </View>
          <View style={s.actions}>
            <Button label="Open evidence" block disabled={!open} onPress={() => go(open)} />
            {review ? <Button label="Review / correct" variant="secondary" block onPress={() => go(review)} /> : null}
            <Button label={f.status === 'RESOLVED' ? 'Reopen' : 'Resolve'} variant="secondary" block
              disabled={!f.revision || Boolean(st.busy)}
              onPress={() => ctl.setStatus(f.findingId, f.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED')} />
            {!open ? <Text style={s.hint0}>This finding records no case and slice, so there is no evidence to open.</Text> : null}
            {!f.revision ? (
              <Text style={s.hint0} testID="finding-status-why">
                The server sent no version of this finding, so its status cannot be changed here.
              </Text>
            ) : null}
          </View>
          <View style={s.details} testID="finding-details">
            <SectionLabel title="Details" />
            {detailLines(f).map((line) => <DetailLine key={line}>{line}</DetailLine>)}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

// The form for a new finding, shown when the route carries a case and slice.
function CreateForm({ ctl, st }) {
  const c = st.context;
  // "CASE_0029 · Slice 45 · DINOv2 100 % · Raw": the case, the slice, the experiment by its label, the prediction.
  const where = placeLine({ ...c, variant: st.form.variant });
  return (
    <View style={s.form} testID="finding-form">
      <SectionLabel title="New finding" />
      <Text style={s.formWhere} testID="finding-context">{where}</Text>
      {st.needsVariant && (
        <View style={s.formRow}>
          <Text style={s.formAsk}>Which prediction was on screen?</Text>
          <SegmentedControl
            label="Prediction"
            options={Object.keys(PREDICTION_VARIANT).map((v) => ({ value: v, label: v }))}
            value={st.form.variant}
            onChange={(v) => ctl.setVariant(v)}
          />
        </View>
      )}
      <View style={s.formChips}>
        {Object.keys(FINDING_TYPE).map((t) => (
          <TypeChip key={t} label={TYPE_LABEL[t]} selected={st.form.type === t} onPress={() => ctl.setType(t)} />
        ))}
      </View>
      <TextInput
        style={s.input}
        value={st.form.note}
        onChangeText={(v) => ctl.setNote(v)}
        placeholder="Note: what you see on the image, and where"
        placeholderTextColor={color.t3}
        multiline
        accessibilityLabel="Finding note"
      />
      <NoteCheck check={st.noteCheck} />
      <Button
        label={st.busy === 'create' ? 'Saving…' : st.noteCheck.warnings.length ? 'Create anyway' : 'Create finding'}
        disabled={!st.canSubmit}
        onPress={() => ctl.submit()}
      />
      {!st.form.type && <Text style={s.hint0}>Choose a type first.</Text>}
      {st.needsVariant && !st.form.variant && <Text style={s.hint0}>Choose the prediction that was on screen.</Text>}
    </View>
  );
}

export default function FindingsScreen({ runtime, nav, params }) {
  const ctl = useMemo(() => createFindingsScreen({ runtime, params, printer: pdfPrinter }), [runtime, params]);
  const [, tick] = useReducer((n) => n + 1, 0);
  const [openId, setOpenId] = useState(null); // the finding whose sheet is open
  useEffect(() => ctl.subscribe(tick), [ctl]);
  const list = useCall(runtime.client, 'findings_list', {});
  useEffect(() => { ctl.provideList(list.view); }, [list.view, ctl]);
  const st = ctl.getState();
  const refetch = list.refetch;
  const opened = openId ? st.items.find((e) => e.finding.findingId === openId) || null : null;

  // The shell's bar says where a new finding is made ("CASE_0029 · Slice 45"), not the run the route carries.
  const where = st.context ? `${st.context.caseId} · Slice ${sliceNumber(st.context.sliceIndex)}` : null;
  useEffect(() => {
    if (!where || typeof nav.setContext !== 'function') return undefined;
    nav.setContext({ subtitle: where });
    return () => nav.setContext(null);
  }, [nav, where]);

  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) nav.pop();
    else if (id === RECOVERY.REFRESH || id === RECOVERY.RETRY) refetch();
  }, [refetch, nav]);

  return (
    <View style={s.root}>
      {st.notice && <Notice notice={st.notice} style={s.notice} />}
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
            renderItem={({ item }) => <FindingRow item={item} onPress={() => setOpenId(item.finding.findingId)} />}
            ListHeaderComponent={<ListTools ctl={ctl} st={st} />}
            ListEmptyComponent={(
              <View style={s.empty}>
                <Text style={s.emptyT}>
                  {st.counts.all === 0 ? 'No findings yet.' : 'No finding matches these filters.'}
                </Text>
                {st.counts.all === 0 ? (
                  <Text style={s.hint0}>Open a slice in Review / Correction and tap New finding here.</Text>
                ) : null}
              </View>
            )}
          />
        )}
      </StateView>
      <FindingSheet item={opened} ctl={ctl} st={st} nav={nav} onClose={() => setOpenId(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  notice: { paddingHorizontal: space.l, paddingTop: space.s },
  banner: { paddingHorizontal: space.l, paddingTop: space.s },
  // filter tabs: 48 dp, a hairline under the row, a 2 dp accent line under the selected tab
  tabs: { flexDirection: 'row', gap: space.xl, paddingHorizontal: space.l, borderBottomWidth: HAIRLINE, borderColor: color.hair },
  tab: { minWidth: MIN_TOUCH - 8, height: MIN_TOUCH, justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabOn: { borderColor: color.accent },
  tabT: { ...type.body, fontWeight: '500', color: color.t2 },
  tabTOn: { color: color.t1 },
  tabN: { fontWeight: '400', color: color.t3, fontVariant: ['tabular-nums'] },
  // type chips: 32 dp high, wrapped into lines (8 dp across, 16 dp between lines: see TypeChip)
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.s, rowGap: space.l, paddingHorizontal: space.l, paddingVertical: space.m },
  chip: {
    height: 32, paddingHorizontal: space.m, borderRadius: radius.m, backgroundColor: color.field, justifyContent: 'center',
  },
  chipOn: { backgroundColor: color.accentSoft },
  chipT: { ...type.secondary, fontWeight: '500', color: color.t2 },
  chipTOn: { color: color.accent },
  chipN: { fontWeight: '400', fontVariant: ['tabular-nums'] },
  control: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m,
    paddingHorizontal: space.l, minHeight: 56,
  },
  shown: { ...type.secondary, color: color.t2, fontVariant: ['tabular-nums'], flexShrink: 1 },
  hint: { ...type.caption, color: color.t3, paddingHorizontal: space.l, paddingBottom: space.s },
  hint0: { ...type.caption, color: color.t3 },
  // list rows: hairline between them, inset like the case list
  row: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m,
    marginHorizontal: space.l, borderTopWidth: HAIRLINE, borderColor: color.hair,
  },
  rowBody: { flex: 1, gap: 2 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  rowType: { ...type.rowId, color: color.t1, flexShrink: 1 },
  rowWhere: { ...type.secondary, color: color.t2, fontVariant: ['tabular-nums'] },
  rowNote: { ...type.secondary, lineHeight: 18, color: color.t2, marginTop: 2 },
  empty: { paddingHorizontal: space.l, paddingTop: space.l, gap: space.xs },
  emptyT: { ...type.body, color: color.t1 },
  // the sheet
  sheetTop: { gap: space.s },
  sheetWhere: { ...type.secondary, color: color.t2, fontVariant: ['tabular-nums'] },
  sheetNote: { ...type.body, color: color.t1 },
  problem: { ...type.caption, color: color.danger },
  actions: { gap: space.s },
  details: { gap: space.xs },
  // the new-finding form
  form: { gap: space.m, paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.l, borderBottomWidth: HAIRLINE, borderColor: color.hair },
  formWhere: { ...type.secondary, color: color.t2, fontVariant: ['tabular-nums'], marginTop: -space.s },
  formRow: { gap: space.s },
  formAsk: { ...type.secondary, color: color.t2 },
  formChips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.s, rowGap: space.l },
  input: {
    minHeight: 88, ...type.body, color: color.t1, backgroundColor: color.field, borderRadius: radius.m,
    paddingHorizontal: space.m, paddingVertical: space.m, textAlignVertical: 'top',
  },
});
