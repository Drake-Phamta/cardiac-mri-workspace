/*
 * SCR-02 Case List: the study's cases with their mode badge (the same one SCR-03 shows), a search box and a mode
 * filter. As a worklist it shows each case's Dice for an experiment the user picks, can put the worst cases first,
 * and marks a case without ground truth "no GT" (never 0). Only the first page of case_list is shown; when the
 * server has more, the screen says so.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { loading, RECOVERY, STATE } from '../../api/states.mjs';
import { useCall } from '../../api/RuntimeContext';
import StateView from '../../components/StateView';
import { describeState } from '../../components/stateCopy.mjs';
import { color, font, MIN_TOUCH, radius, space } from '../../components/theme';
import CapabilityBadge from '../../components/CapabilityBadge';
import {
  filterRows, pinnedOutlierSelection, readCaseRows, readExperimentCases, readExperimentChoices, rememberedWorklist,
  rememberWorklist, WORKLIST_SORT, worklistRows,
} from './cases.mjs';

const MODES = [
  { key: 'ALL', label: 'All' },
  { key: 'EVALUATION', label: 'Evaluation' },
  { key: 'INFERENCE_REVIEW', label: 'Inference & review' },
];

const SORTS = [
  { key: WORKLIST_SORT.SERVER, label: 'Server order' },
  { key: WORKLIST_SORT.WORST_FIRST, label: 'Worst first' },
];

const CASE_ID_SHAPE = /^[A-Za-z0-9_.-]{1,64}$/;

export default function CaseListScreen({ runtime, nav }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('ALL');
  const [choice, setChoice] = useState(rememberedWorklist);
  const choose = useCallback((patch) => setChoice((c) => {
    const next = { ...c, ...patch };
    rememberWorklist(next);
    return next;
  }), []);

  // useCall: the latest call wins, refetch shows LOADING, and the call is aborted when the screen closes.
  const { view, refetch: load } = useCall(runtime.client, 'case_list', { study_id: runtime.config.studyId });
  const experiments = useCall(runtime.client, 'experiment_list', {});
  const experimentCases = useCall(
    runtime.client, 'experiment_cases', { experiment_id: choice.experimentId }, { enabled: Boolean(choice.experimentId) },
  );
  // Right after another experiment is picked, useCall still holds the previous experiment's answer for one render
  // (its LOADING comes from an effect). The answer counts only once a LOADING was seen for the experiment picked now.
  const loadingFor = useRef(null);
  if (experimentCases.view.state === STATE.LOADING) loadingFor.current = choice.experimentId;
  const casesView = choice.experimentId
    ? (loadingFor.current === choice.experimentId ? experimentCases.view : loading())
    : null;

  const choices = useMemo(
    () => (experiments.view.state === STATE.SUCCESS ? readExperimentChoices(experiments.view.data) : []),
    [experiments.view],
  );
  const picked = choices.find((e) => e.experimentId === choice.experimentId) || null;
  const pinned = useMemo(() => pinnedOutlierSelection(runtime.contract), [runtime.contract]);
  const cases = useMemo(() => (picked && casesView && casesView.state === STATE.SUCCESS
    ? readExperimentCases(casesView.data, { experimentId: picked.experimentId, variant: picked.variant, pinned })
    : null), [picked, casesView, pinned]);

  const onAction = useCallback((id) => {
    if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) load();
    else if (id === RECOVERY.BACK) nav.pop();
  }, [load, nav]);

  // A row with a run in the chosen experiment opens that run and variant, so SCR-03 shows what the Dice is about.
  const open = useCallback((caseId, runId = null) => {
    if (runId && cases && cases.ok && cases.variant) nav.push('SCR-03', { caseId, runId, variant: cases.variant });
    else nav.push('SCR-03', { caseId });
  }, [nav, cases]);

  return (
    <View style={s.root}>
      <View style={s.head}>
        <Text style={s.study}>Study {runtime.config.studyId}</Text>
        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search case ID (e.g. CASE_0061)"
          placeholderTextColor={color.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Search case ID"
        />
        <View style={s.modes}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[s.mode, mode === m.key && s.modeOn]}
              onPress={() => setMode(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m.key }}
            >
              <Text style={[s.modeT, mode === m.key && s.modeTOn]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ExperimentPicker
          experiments={experiments.view}
          choices={choices}
          chosen={choice.experimentId}
          onChoose={(experimentId) => choose({ experimentId })}
        />
        <View style={s.sortRow}>
          <Text style={s.rowLabel}>Order</Text>
          {SORTS.map((o) => {
            const off = o.key === WORKLIST_SORT.WORST_FIRST && !(cases && cases.ok);
            return (
              <TouchableOpacity
                key={o.key}
                style={[s.chip, choice.sort === o.key && !off && s.chipOn, off && s.chipOff]}
                onPress={() => choose({ sort: o.key })}
                disabled={off}
                accessibilityRole="button"
                accessibilityState={{ selected: choice.sort === o.key, disabled: off }}
              >
                <Text style={[s.chipT, choice.sort === o.key && !off && s.chipTOn]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <StateView view={view} what="the case list" onAction={onAction}>
        {(data) => (
          <CaseRows
            data={data}
            query={query}
            mode={mode}
            picked={picked}
            casesView={casesView}
            cases={cases}
            sort={choice.sort}
            onOpen={open}
            onRefresh={load}
          />
        )}
      </StateView>
    </View>
  );
}

// The experiment chips: "None" plus one per experiment the server lists, each with its variant.
function ExperimentPicker({ experiments, choices, chosen, onChoose }) {
  if (experiments.state !== STATE.SUCCESS) {
    const d = describeState(experiments, { what: 'the experiments' });
    const text = experiments.state === STATE.LOADING ? 'Loading the experiments…' : `Dice unavailable: ${d.body || d.title}`;
    return <Text style={s.note}>{text}</Text>;
  }
  if (choices.length === 0) return <Text style={s.note}>The server lists no experiment, so there is no Dice to show.</Text>;
  return (
    <View style={s.sortRow}>
      <Text style={s.rowLabel}>Dice of</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {[{ experimentId: null, variant: null }, ...choices].map((e) => {
          const on = chosen === e.experimentId;
          return (
            <TouchableOpacity
              key={e.experimentId || 'none'}
              style={[s.chip, on && s.chipOn]}
              onPress={() => onChoose(e.experimentId)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={e.experimentId ? `Show the Dice of ${e.experimentId}, ${e.variant || 'variant not stated'}` : 'Show no Dice'}
            >
              <Text style={[s.chipT, on && s.chipTOn]}>{e.experimentId ? `${e.experimentId} · ${e.variant || '?'}` : 'None'}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// One line under the controls: what the chips show, or why there are none.
function worklistNote(picked, casesView, cases, sort) {
  if (!picked) return 'Choose an experiment to see each case\'s Dice.';
  if (!casesView || casesView.state === STATE.LOADING) return `Loading the Dice of ${picked.experimentId}…`;
  if (casesView.state !== STATE.SUCCESS) {
    const d = describeState(casesView, { what: 'the per-case results' });
    return `Dice of ${picked.experimentId} unavailable: ${d.body || d.title}`;
  }
  if (!cases.ok) return cases.problem;
  const order = sort === WORKLIST_SORT.WORST_FIRST
    ? ' Sorted on this phone: lowest Dice first (ties: more FP + FN, then case ID); cases without a Dice follow.'
    : '';
  return `Dice of ${picked.experimentId} (${cases.variant}) from the server${cases.metricVersion ? `, metric ${cases.metricVersion}` : ''}.${order}`
    + ' "Outlier n/3" is the server\'s own pick of the three worst cases.';
}

function CaseRows({ data, query, mode, picked, casesView, cases, sort, onOpen, onRefresh }) {
  const read = useMemo(() => readCaseRows(data), [data]);
  const listed = useMemo(
    () => worklistRows(read.rows, cases, { experimentId: picked ? picked.experimentId : null, sort }),
    [read, cases, picked, sort],
  );
  const rows = useMemo(() => filterRows(listed, { query, mode }), [listed, query, mode]);
  const typed = query.trim().toUpperCase();
  const exact = read.rows.some((r) => r.caseId.toUpperCase() === typed);
  const canOpenTyped = typed !== '' && !exact && CASE_ID_SHAPE.test(typed);
  const note = worklistNote(picked, casesView, cases, sort);

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.caseId}
      contentContainerStyle={s.list}
      onRefresh={onRefresh}
      refreshing={false}
      ListHeaderComponent={(
        <View>
          <Text style={s.summary}>
            {read.counts.total} case{read.counts.total === 1 ? '' : 's'} on this page · {read.counts.EVALUATION} evaluation · {read.counts.INFERENCE_REVIEW} inference & review
            {read.counts.UNKNOWN ? ` · ${read.counts.UNKNOWN} mode not stated` : ''}
          </Text>
          <Text style={[s.note, cases && !cases.ok && s.warn]}>{note}</Text>
          {cases && cases.outlierNote ? <Text style={s.note}>{cases.outlierNote}</Text> : null}
          {read.hasMore && (
            <Text style={s.note}>The server has more cases than this page (next_page is set). This build lists the first page only.</Text>
          )}
          {canOpenTyped && (
            <TouchableOpacity style={s.openTyped} onPress={() => onOpen(typed)} accessibilityRole="button">
              <Text style={s.openTypedT}>Open {typed} directly ›</Text>
              <Text style={s.note}>Not in this page. The case screen checks it with the server (CASE_NOT_FOUND if it does not exist).</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={(
        <Text style={s.empty}>
          {read.rows.length === 0 ? 'The server returned no cases for this study.' : 'No case matches this search and mode.'}
        </Text>
      )}
      ListFooterComponent={read.invalid.length > 0 ? (
        <View style={s.invalid}>
          {read.invalid.map((x) => (
            <Text key={x.position} style={s.invalidT}>Row {x.position}: {x.reason} - not openable.</Text>
          ))}
        </View>
      ) : null}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.row}
          onPress={() => onOpen(item.caseId, item.runId)}
          accessibilityRole="button"
          accessibilityLabel={`${item.caseId}, ${item.capability.label}${item.chip ? `, ${item.chip.text}` : ''}${item.outlierRank ? `, server outlier ${item.outlierRank} of 3` : ''}`}
        >
          <View style={s.rowMain}>
            <Text style={s.caseId}>{item.caseId}</Text>
            <Text style={s.detail}>{item.capability.detail}</Text>
            {!item.capability.consistent && <Text style={s.warn}>{item.capability.problem}</Text>}
            {item.chip ? (
              <View style={s.rowChips}>
                <Text style={[s.value, CHIP_STYLE[item.chip.kind] || s.valueDim]}>{item.chip.text}</Text>
                {item.outlierRank ? <Text style={[s.value, s.valueOutlier]}>outlier {item.outlierRank}/3</Text> : null}
              </View>
            ) : null}
          </View>
          <CapabilityBadge capability={item.capability} />
        </TouchableOpacity>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  head: { padding: space.l, paddingBottom: space.s, gap: space.s },
  study: { color: color.textDim, fontFamily: font.mono, fontSize: font.small },
  search: {
    minHeight: MIN_TOUCH, borderWidth: 1, borderColor: color.control, borderRadius: radius.m, paddingHorizontal: space.m,
    color: color.text, backgroundColor: color.surface, fontFamily: font.mono, fontSize: font.body,
  },
  modes: { flexDirection: 'row', gap: space.s },
  mode: {
    flex: 1, minHeight: MIN_TOUCH, borderRadius: radius.m, borderWidth: 1, borderColor: color.control,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface, paddingHorizontal: space.xs,
  },
  modeOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  modeT: { color: color.textDim, fontSize: font.small, fontWeight: '600', textAlign: 'center' },
  modeTOn: { color: color.accent },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowLabel: { color: color.textDim, fontSize: font.small, minWidth: 52 },
  chips: { gap: space.xs, paddingRight: space.l },
  chip: {
    minHeight: MIN_TOUCH, paddingHorizontal: space.m, borderRadius: radius.pill, borderWidth: 1, borderColor: color.control,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface,
  },
  chipOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  chipOff: { opacity: 0.45 },
  chipT: { color: color.textDim, fontSize: font.small, fontWeight: '600', fontFamily: font.mono },
  chipTOn: { color: color.accent },
  list: { paddingHorizontal: space.l, paddingBottom: space.xl },
  summary: { color: color.textDim, fontSize: font.small, marginBottom: space.s },
  note: { color: color.textDim, fontSize: font.small, marginBottom: space.s },
  openTyped: {
    borderWidth: 1, borderColor: color.accent, borderRadius: radius.m, padding: space.m, marginBottom: space.s,
    backgroundColor: color.accentBg, minHeight: MIN_TOUCH,
  },
  openTypedT: { color: color.accent, fontSize: font.body, fontWeight: '700', marginBottom: 2 },
  row: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, marginBottom: space.s,
    borderRadius: radius.l, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface,
  },
  rowMain: { flex: 1 },
  rowChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  value: {
    fontFamily: font.mono, fontSize: font.small, fontWeight: '700', fontVariant: font.numeric,
    paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.s, borderWidth: 1, overflow: 'hidden',
  },
  valueDice: { color: color.text, borderColor: color.control, backgroundColor: color.surfaceHi },
  valueNoGt: { color: color.inference, borderColor: color.inference, backgroundColor: color.inferenceBg },
  valueFailed: { color: color.danger, borderColor: color.danger, backgroundColor: color.dangerBg },
  valueDim: { color: color.textDim, borderColor: color.border, backgroundColor: color.surface },
  valueOutlier: { color: color.warn, borderColor: color.warn, backgroundColor: color.warnBg },
  caseId: { color: color.text, fontFamily: font.mono, fontSize: font.h2, fontWeight: '700' },
  detail: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  warn: { color: color.warn, fontSize: font.small, marginTop: 2 },
  empty: { color: color.textDim, fontSize: font.body, textAlign: 'center', marginTop: space.xl },
  invalid: { marginTop: space.s, padding: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: color.warn, backgroundColor: color.warnBg },
  invalidT: { color: color.warn, fontSize: font.small, fontFamily: font.mono },
});

const CHIP_STYLE = {
  DICE: s.valueDice,
  NO_GT: s.valueNoGt,
  FAILED: s.valueFailed,
};
