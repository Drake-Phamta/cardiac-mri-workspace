/*
 * SCR-02 Case List, Direction A: a search field, filter tabs with counts, the "Dice of" experiment picker and the
 * Server / Worst first order, then dense 52 dp rows (id, outlier tag, Dice bar, value). It opens on an experiment:
 * DINOv2 at the largest data fraction the server lists, raw first (cases.mjs defaultExperimentCandidates), until
 * the person picks another or "None". The picker names an experiment as people do ("DINOv2 100 % · Raw") and shows
 * its id on a second line in the sheet. With Worst first, the cases without a Dice follow under "No Dice for this
 * experiment" and say why in words ("No GT", "Run failed"), never 0. How the Dice is read and sorted, and the
 * experiment's id, go to the Details sheet behind Info. Only the first page of case_list is shown; when the server
 * has more, the list says so.
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
import { color, HAIRLINE, hitSlopFor, MIN_TOUCH, size, space, type } from '../../components/theme';
import {
  defaultExperimentCandidates, experimentLabel, filterRows, hasExperimentName, pinnedOutlierSelection, readCaseRows,
  readExperimentCases, readExperimentChoices, rememberedWorklist, rememberWorklist, WORKLIST_SORT, worklistRows,
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

// A tab is the 44 dp row less its 1 dp bottom hairline.
const TAB_HEIGHT = size.filterTabs - HAIRLINE;
const CASE_ID_SHAPE = /^[A-Za-z0-9_.-]{1,64}$/;
const GROUP = Object.freeze({ group: true, key: 'no-dice' });

// "no GT" -> "No GT": a worklist word at the end of a row.
const sentence = (t) => (typeof t === 'string' && t ? t[0].toUpperCase() + t.slice(1) : t);
const experimentText = (e) => experimentLabel(e.experimentId, e.variant);

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
  const choices = useMemo(
    () => (experiments.view.state === STATE.SUCCESS ? readExperimentChoices(experiments.view.data) : []),
    [experiments.view],
  );
  // Nothing chosen yet (undefined): the first default whose answer holds a Dice. A default whose per-case answer has
  // no Dice at all is put in `noDice` and the next one is shown. null is the person's own "None".
  const [noDice, setNoDice] = useState([]);
  const candidates = useMemo(() => defaultExperimentCandidates(choices), [choices]);
  const defaulted = choice.experimentId === undefined;
  const experimentId = defaulted
    ? (candidates.find((id) => !noDice.includes(id)) ?? candidates[0] ?? null)
    : choice.experimentId;
  const experimentCases = useCall(
    runtime.client, 'experiment_cases', { experiment_id: experimentId }, { enabled: Boolean(experimentId) },
  );
  // Right after another experiment is picked, useCall still holds the previous experiment's answer for one render
  // (its LOADING comes from an effect). The answer counts only once a LOADING was seen for the experiment picked now.
  const loadingFor = useRef(null);
  if (experimentCases.view.state === STATE.LOADING) loadingFor.current = experimentId;
  const casesView = experimentId
    ? (loadingFor.current === experimentId ? experimentCases.view : loading())
    : null;

  const picked = choices.find((e) => e.experimentId === experimentId) || null;
  const pinned = useMemo(() => pinnedOutlierSelection(runtime.contract), [runtime.contract]);
  const cases = useMemo(() => (picked && casesView && casesView.state === STATE.SUCCESS
    ? readExperimentCases(casesView.data, { experimentId: picked.experimentId, variant: picked.variant, pinned })
    : null), [picked, casesView, pinned]);
  const read = useMemo(() => (view.state === STATE.SUCCESS ? readCaseRows(view.data) : null), [view]);
  const usable = Boolean(cases && cases.ok);
  useEffect(() => {
    if (!defaulted || !picked || !cases) return;
    const hasDice = cases.ok && [...cases.byCase.values()].some((e) => e.status === 'SUCCEEDED' && e.dice !== null);
    if (!hasDice) setNoDice((list) => (list.includes(picked.experimentId) ? list : [...list, picked.experimentId]));
  }, [defaulted, picked, cases]);

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
        `Dice of ${experimentText(picked)} (experiment ${picked.experimentId}, ${cases.variant}) from the server${cases.metricVersion ? `, metric ${cases.metricVersion}` : ''}.`,
        defaulted ? 'Chosen for you: DINOv2 at the largest data fraction the server lists, raw before post-processed. Pick another in "Dice of".' : null,
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
      <Pressable style={s.search} onPress={() => search.current && search.current.focus && search.current.focus()} hitSlop={hitSlopFor(size.search)}>
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
              hitSlop={hitSlopFor(TAB_HEIGHT)}
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
        <TouchableOpacity
          style={s.dropdown}
          onPress={() => setPickerOpen(true)}
          disabled={experiments.view.state !== STATE.SUCCESS || choices.length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Dice of: ${picked ? experimentText(picked) : 'choose an experiment'}`}
          testID="dice-of"
        >
          <Text style={s.controlLabel}>Dice of</Text>
          <View style={s.dropdownValue}>
            <Text style={[s.dropdownT, !picked && s.dropdownPlaceholder]} numberOfLines={1}>
              {picked ? experimentText(picked) : dropdownWord(experiments.view, choices)}
            </Text>
            <IconChevronDown size={18} color={color.t2} />
          </View>
        </TouchableOpacity>
        <View style={[s.order, !usable && s.off]} pointerEvents={usable ? 'auto' : 'none'} accessibilityState={{ disabled: !usable }}>
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
            const on = (experimentId ?? null) === e.experimentId;
            return (
              <TouchableOpacity
                key={e.experimentId || 'none'}
                style={[s.pick, i < all.length - 1 && s.pickLine]}
                onPress={() => { choose({ experimentId: e.experimentId }); setPickerOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={e.experimentId ? `Show the Dice of ${experimentText(e)}, experiment ${e.experimentId}` : 'Show no Dice'}
              >
                <View style={s.pickText}>
                  <Text style={s.pickTitle} numberOfLines={1}>{e.experimentId ? experimentText(e) : 'None (no Dice)'}</Text>
                  {e.experimentId && hasExperimentName(e.experimentId) ? <Text style={s.pickId}>{e.experimentId}</Text> : null}
                </View>
                {on ? <IconCheck size={20} strokeWidth={2} color={color.accent} /> : null}
              </TouchableOpacity>
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
  if (!casesView || casesView.state === STATE.LOADING) return { text: `Loading the Dice of ${experimentText(picked)}…`, warn: false };
  if (casesView.state !== STATE.SUCCESS) {
    const d = describeState(casesView, { what: 'the per-case results' });
    return { text: `Dice of ${experimentText(picked)} unavailable: ${d.body || d.title}`, warn: true };
  }
  if (!cases.ok) return { text: cases.problem, warn: true };
  return null;
}

function CaseRows({ read, query, mode, cases, sort, onOpen, onRefresh }) {
  const usable = Boolean(cases && cases.ok);
  const listed = useMemo(
    () => worklistRows(read.rows, cases, { sort }),
    [read, cases, sort],
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
  // One row: the experiment on the left, the order on the right. A name too long for the room (Processed, a large
  // system font) sends the order to a second line instead of cutting the name off.
  controls: { minHeight: size.controlRow, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, paddingHorizontal: space.l },
  order: { marginLeft: 'auto' },
  controlLabel: { ...type.caption, color: color.t3 },
  // The label sits over the name. It grows to fill the row but never shrinks, so the name is never cut off.
  dropdown: { flexGrow: 1, flexShrink: 0, minHeight: MIN_TOUCH, justifyContent: 'center' },
  dropdownValue: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dropdownT: { ...type.body, fontWeight: '500', color: color.t1, flexShrink: 1 },
  dropdownPlaceholder: { color: color.t2 },
  pick: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  pickLine: { borderBottomWidth: HAIRLINE, borderColor: color.hair },
  pickText: { flex: 1, gap: 2 },
  pickTitle: { ...type.body, fontWeight: '500', color: color.t1 },
  pickId: { ...type.caption, color: color.t3, fontVariant: ['tabular-nums'] },
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
