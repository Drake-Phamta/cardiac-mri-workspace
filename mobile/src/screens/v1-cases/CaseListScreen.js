/*
 * SCR-02 Case List, Direction A: a search field, filter tabs with counts, the "Dice of" experiment picker and the
 * Server / Worst first order, then dense 52 dp rows (id, outlier tag, Dice bar, value). With an experiment chosen
 * and Worst first, the cases without a Dice follow under "No Dice for this experiment" and say why in words
 * ("No GT", "Run failed"), never 0. How the Dice is read and sorted goes to the Details sheet behind Info. Only the
 * first page of case_list is shown; when the server has more, the list says so.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { loading, RECOVERY, STATE } from '../../api/states.mjs';
import { useCall } from '../../api/RuntimeContext';
import StateView from '../../components/StateView';
import { describeState } from '../../components/stateCopy.mjs';
import { SegmentedControl, Tag } from '../../components/Controls';
import { Sheet } from '../../components/DetailsSheet';
import ListRow, { SectionLabel } from '../../components/ListRow';
import { IconAlert, IconCheck, IconChevronDown, IconChevronRight, IconSearch, IconSort } from '../../components/icons';
import { color, HAIRLINE, MIN_TOUCH, size, space, type } from '../../components/theme';
import {
  filterRows, pinnedOutlierSelection, readCaseRows, readExperimentCases, readExperimentChoices, rememberedWorklist,
  rememberWorklist, variantLabel, WORKLIST_SORT, worklistRows,
} from './cases.mjs';

const MODES = [
  { key: 'ALL', label: 'All', count: 'total' },
  { key: 'EVALUATION', label: 'Evaluation', count: 'EVALUATION' },
  { key: 'INFERENCE_REVIEW', label: 'Inference & review', count: 'INFERENCE_REVIEW' },
];

const SORTS = [
  { value: WORKLIST_SORT.SERVER, label: 'Server' },
  { value: WORKLIST_SORT.WORST_FIRST, label: 'Worst first', icon: IconSort },
];

const CASE_ID_SHAPE = /^[A-Za-z0-9_.-]{1,64}$/;
const GROUP = Object.freeze({ group: true, key: 'no-dice' });

// "no GT" -> "No GT": a worklist word at the end of a row.
const sentence = (t) => (typeof t === 'string' && t ? t[0].toUpperCase() + t.slice(1) : t);
const experimentText = (e) => `${e.experimentId} · ${e.variant ? variantLabel(e.variant) : 'variant not stated'}`;

export default function CaseListScreen({ runtime, nav }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('ALL');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [choice, setChoice] = useState(rememberedWorklist);
  const choose = useCallback((patch) => setChoice((c) => {
    const next = { ...c, ...patch };
    rememberWorklist(next);
    return next;
  }), []);
  const search = useRef(null);

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
  const read = useMemo(() => (view.state === STATE.SUCCESS ? readCaseRows(view.data) : null), [view]);
  const usable = Boolean(cases && cases.ok);

  const onAction = useCallback((id) => {
    if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) load();
    else if (id === RECOVERY.BACK) nav.pop();
  }, [load, nav]);

  // A row with a run in the chosen experiment opens that run and variant, so SCR-03 shows what the Dice is about.
  const open = useCallback((caseId, runId = null) => {
    if (runId && cases && cases.ok && cases.variant) nav.push('SCR-03', { caseId, runId, variant: cases.variant });
    else nav.push('SCR-03', { caseId });
  }, [nav, cases]);

  // How the Dice is read and sorted, the outlier rule and the page: the Details sheet behind the app bar's Info.
  const detailSections = [];
  if (picked && cases && cases.ok) {
    detailSections.push({
      title: 'Dice',
      lines: [
        `Dice of ${picked.experimentId} (${cases.variant}) from the server${cases.metricVersion ? `, metric ${cases.metricVersion}` : ''}.`,
        'Worst first is sorted on this phone: lowest Dice first (ties: more FP + FN, then case ID); cases without a Dice follow.',
        '"Outlier n/3" is the server\'s own pick of the three worst cases.',
        cases.outlierNote,
      ].filter(Boolean),
    });
  }
  if (read) {
    detailSections.push({
      title: 'This page',
      lines: [
        `${read.counts.total} case${read.counts.total === 1 ? '' : 's'} on this page · ${read.counts.EVALUATION} evaluation · ${read.counts.INFERENCE_REVIEW} inference & review${read.counts.UNKNOWN ? ` · ${read.counts.UNKNOWN} mode not stated` : ''}`,
        read.hasMore ? 'The server has more cases than this page (next_page is set). This build lists the first page only.' : null,
      ].filter(Boolean),
    });
  }
  const detailsKey = JSON.stringify(detailSections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = useMemo(() => detailSections, [detailsKey]);
  useEffect(() => {
    if (typeof nav.setContext === 'function') nav.setContext({ details });
  }, [nav, details]);
  useEffect(() => () => { if (typeof nav.setContext === 'function') nav.setContext(null); }, [nav]);

  const note = worklistNote(experiments.view, choices, picked, casesView, cases);

  return (
    <View style={s.root}>
      <Pressable style={s.search} onPress={() => search.current && search.current.focus && search.current.focus()} hitSlop={{ top: 4, bottom: 4 }}>
        <IconSearch size={18} color={color.t3} />
        <TextInput
          ref={search}
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search case ID"
          placeholderTextColor={color.t3}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Search case ID"
        />
      </Pressable>

      <View style={s.tabs}>
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={s.tab}
              onPress={() => setMode(m.key)}
              hitSlop={{ top: 2, bottom: 2 }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.tabT, on && s.tabTOn]}>{m.label}</Text>
              {read ? <Text style={s.tabCount}>{read.counts[m.count]}</Text> : null}
              {on ? <View style={s.tabLine} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.controls}>
        <Text style={s.controlLabel}>Dice of</Text>
        <TouchableOpacity
          style={s.dropdown}
          onPress={() => setPickerOpen(true)}
          disabled={experiments.view.state !== STATE.SUCCESS || choices.length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Dice of: ${picked ? experimentText(picked) : 'choose an experiment'}`}
          testID="dice-of"
        >
          <Text style={[s.dropdownT, !picked && s.dropdownPlaceholder]} numberOfLines={1}>
            {picked ? experimentText(picked) : dropdownWord(experiments.view, choices)}
          </Text>
          <IconChevronDown size={18} color={color.t2} />
        </TouchableOpacity>
        <View style={s.spacer} />
        <View style={!usable && s.off} pointerEvents={usable ? 'auto' : 'none'} accessibilityState={{ disabled: !usable }}>
          <SegmentedControl label="Order" options={SORTS} value={choice.sort} onChange={(sort) => choose({ sort })} />
        </View>
      </View>
      {note ? <Text style={[s.note, note.warn && s.noteWarn]}>{note.text}</Text> : null}

      <StateView view={view} what="the case list" onAction={onAction}>
        {() => (
          <CaseRows
            read={read}
            query={query}
            mode={mode}
            picked={picked}
            cases={cases}
            sort={choice.sort}
            onOpen={open}
            onRefresh={load}
          />
        )}
      </StateView>

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Dice of" testID="experiment-sheet">
        <View>
          {[{ experimentId: null, variant: null }, ...choices].map((e, i, all) => {
            const on = choice.experimentId === e.experimentId;
            return (
              <ListRow
                key={e.experimentId || 'none'}
                title={e.experimentId ? experimentText(e) : 'None (no Dice)'}
                onPress={() => { choose({ experimentId: e.experimentId }); setPickerOpen(false); }}
                chevron={false}
                trailing={on ? <IconCheck size={20} strokeWidth={2} color={color.accent} /> : null}
                divider={i === all.length - 1 ? 'none' : 'bottom'}
                accessibilityLabel={e.experimentId ? `Show the Dice of ${e.experimentId}, ${e.variant || 'variant not stated'}` : 'Show no Dice'}
              />
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

function dropdownWord(experiments, choices) {
  if (experiments.state === STATE.LOADING) return 'Loading…';
  if (experiments.state !== STATE.SUCCESS) return 'Unavailable';
  return choices.length ? 'Choose' : 'None listed';
}

// One line under the controls when there is no Dice to show, or the Dice cannot be shown as asked.
function worklistNote(experiments, choices, picked, casesView, cases) {
  if (experiments.state === STATE.LOADING) return null;
  if (experiments.state !== STATE.SUCCESS) {
    const d = describeState(experiments, { what: 'the experiments' });
    return { text: `Dice unavailable: ${d.body || d.title}`, warn: true };
  }
  if (choices.length === 0) return { text: 'The server lists no experiment, so there is no Dice to show.', warn: false };
  if (!picked) return { text: 'Choose an experiment to see each case\'s Dice.', warn: false };
  if (!casesView || casesView.state === STATE.LOADING) return { text: `Loading the Dice of ${picked.experimentId}…`, warn: false };
  if (casesView.state !== STATE.SUCCESS) {
    const d = describeState(casesView, { what: 'the per-case results' });
    return { text: `Dice of ${picked.experimentId} unavailable: ${d.body || d.title}`, warn: true };
  }
  if (!cases.ok) return { text: cases.problem, warn: true };
  return null;
}

function CaseRows({ read, query, mode, picked, cases, sort, onOpen, onRefresh }) {
  const usable = Boolean(cases && cases.ok);
  const listed = useMemo(
    () => worklistRows(read.rows, cases, { experimentId: picked ? picked.experimentId : null, sort }),
    [read, cases, picked, sort],
  );
  const rows = useMemo(() => filterRows(listed, { query, mode }), [listed, query, mode]);
  // Worst first ranks the cases with a Dice; the others follow under their own heading, in the server's order.
  const data = useMemo(() => {
    if (!usable || sort !== WORKLIST_SORT.WORST_FIRST) return rows;
    const ranked = rows.filter((r) => r.chip && r.chip.kind === 'DICE');
    const rest = rows.filter((r) => !(r.chip && r.chip.kind === 'DICE'));
    return rest.length ? [...ranked, GROUP, ...rest] : ranked;
  }, [rows, usable, sort]);
  const typed = query.trim().toUpperCase();
  const exact = read.rows.some((r) => r.caseId.toUpperCase() === typed);
  const canOpenTyped = typed !== '' && !exact && CASE_ID_SHAPE.test(typed);
  const lastKey = data.length ? (data[data.length - 1].caseId || GROUP.key) : null;

  return (
    <FlatList
      data={data}
      keyExtractor={(r) => r.caseId || r.key}
      contentContainerStyle={s.list}
      onRefresh={onRefresh}
      refreshing={false}
      ListHeaderComponent={(
        <View>
          <SectionLabel variant="column" title="Case" meta={usable ? 'Dice' : null} />
          {canOpenTyped && (
            <TouchableOpacity style={s.openTyped} onPress={() => onOpen(typed)} accessibilityRole="button">
              <View style={s.openTypedText}>
                <Text style={s.openTypedT}>Open {typed} directly</Text>
                <Text style={s.caption}>Not in this page. The case screen checks it with the server (CASE_NOT_FOUND if it does not exist).</Text>
              </View>
              <IconChevronRight size={16} color={color.t3} />
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={(
        <Text style={s.empty}>
          {read.rows.length === 0 ? 'The server returned no cases for this study.' : 'No case matches this search and filter.'}
        </Text>
      )}
      ListFooterComponent={(
        <View style={s.footer}>
          {read.hasMore ? (
            <Text style={s.caption}>The server has more cases than this page (next_page is set). This build lists the first page only.</Text>
          ) : null}
          {read.invalid.map((x) => (
            <Text key={x.position} style={s.invalidT}>Row {x.position}: {x.reason} - not openable.</Text>
          ))}
        </View>
      )}
      renderItem={({ item }) => (item.group ? (
        <SectionLabel variant="group" title="No Dice for this experiment" />
      ) : (
        <CaseRow item={item} last={item.caseId === lastKey} onOpen={onOpen} />
      ))}
    />
  );
}

// One 52 dp row: id, a tag (the server's outlier pick, or a mode other than Evaluation), then the Dice as a bar and
// three decimals, or a word for a case without one.
function CaseRow({ item, last, onOpen }) {
  const chip = item.chip;
  const hasDice = Boolean(chip && chip.kind === 'DICE');
  let tag = null;
  if (item.outlierRank) tag = <Tag label={`Outlier ${item.outlierRank}/3`} tone="warn" />;
  else if (!item.capability.consistent) tag = <Tag label="Mode unclear" tone="warn" />;
  else if (item.capability.key !== 'EVALUATION') tag = <Tag label={item.capability.label} />;
  let trailing = null;
  if (chip && !hasDice) {
    trailing = chip.kind === 'FAILED' ? (
      <View style={s.word}>
        <IconAlert size={16} strokeWidth={2} color={color.danger} />
        <Text style={s.failed}>{sentence(chip.text)}</Text>
      </View>
    ) : <Text style={s.na}>{sentence(chip.text)}</Text>;
  }
  return (
    <View style={s.rowWrap}>
      <ListRow
        variant="case"
        title={item.caseId}
        tag={tag}
        bar={hasDice ? chip.value : undefined}
        barTone={item.outlierRank ? 'warn' : 'neutral'}
        value={hasDice ? chip.value.toFixed(3) : null}
        trailing={trailing}
        onPress={() => onOpen(item.caseId, item.runId)}
        divider={last ? 'none' : 'bottom'}
        accessibilityLabel={`${item.caseId}, ${item.capability.label}${chip ? `, ${chip.text}` : ''}${item.outlierRank ? `, server outlier ${item.outlierRank} of 3` : ''}${item.capability.consistent ? '' : `, ${item.capability.problem}`}`}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  search: {
    height: size.search, marginHorizontal: space.l, borderRadius: 8, backgroundColor: color.field,
    flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m,
  },
  searchInput: { flex: 1, height: size.search, padding: 0, ...type.body, color: color.t1 },
  tabs: {
    height: size.filterTabs, marginTop: space.xs, flexDirection: 'row', gap: space.xl, paddingHorizontal: space.l,
    borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabT: { ...type.body, fontWeight: '500', color: color.t2 },
  tabTOn: { color: color.t1 },
  tabCount: { ...type.body, color: color.t3, fontVariant: ['tabular-nums'] },
  tabLine: {
    position: 'absolute', left: 0, right: 0, bottom: -HAIRLINE, height: 2,
    borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: color.accent,
  },
  controls: { height: size.controlRow, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.l },
  controlLabel: { ...type.caption, color: color.t3 },
  dropdown: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  dropdownT: { ...type.body, fontWeight: '500', color: color.t1, flexShrink: 1 },
  dropdownPlaceholder: { color: color.t2 },
  spacer: { flex: 1 },
  off: { opacity: 0.4 },
  note: { ...type.caption, color: color.t3, paddingHorizontal: space.l, marginTop: -space.xs, marginBottom: space.s },
  noteWarn: { color: color.warn },
  list: { paddingBottom: space.xl },
  rowWrap: { paddingHorizontal: space.l },
  word: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  na: { ...type.secondary, color: color.t3 },
  failed: { ...type.secondary, fontWeight: '500', color: color.danger },
  openTyped: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.m, marginHorizontal: space.l, paddingVertical: space.s,
    borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  openTypedText: { flex: 1, gap: 2 },
  openTypedT: { ...type.body, fontWeight: '500', color: color.accent },
  caption: { ...type.caption, color: color.t3 },
  empty: { ...type.body, color: color.t2, textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.l },
  footer: { paddingHorizontal: space.l, paddingTop: space.m, gap: space.xs },
  invalidT: { ...type.caption, color: color.warn },
});
