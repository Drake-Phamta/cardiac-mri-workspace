/*
 * SCR-02 Case List: the study's cases with their mode badge (the same one SCR-03 shows), a search box and a mode
 * filter. Only the first page of case_list is shown; when the server has more, the screen says so.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { RECOVERY } from '../../api/states.mjs';
import { useCall } from '../../api/RuntimeContext';
import StateView from '../../components/StateView';
import { color, font, MIN_TOUCH, space } from '../../components/theme';
import CapabilityBadge from '../../components/CapabilityBadge';
import { filterRows, readCaseRows } from './cases.mjs';

const MODES = [
  { key: 'ALL', label: 'All' },
  { key: 'EVALUATION', label: 'Evaluation' },
  { key: 'INFERENCE_REVIEW', label: 'Inference & review' },
];

const CASE_ID_SHAPE = /^[A-Za-z0-9_.-]{1,64}$/;

export default function CaseListScreen({ runtime, nav }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('ALL');

  // useCall: the latest call wins, refetch shows LOADING, and the call is aborted when the screen closes.
  const { view, refetch: load } = useCall(runtime.client, 'case_list', { study_id: runtime.config.studyId });

  const onAction = useCallback((id) => {
    if (id === RECOVERY.RETRY || id === RECOVERY.REFRESH) load();
    else if (id === RECOVERY.BACK) nav.pop();
  }, [load, nav]);

  const open = useCallback((caseId) => nav.push('SCR-03', { caseId }), [nav]);

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
      </View>
      <StateView view={view} what="the case list" onAction={onAction}>
        {(data) => <CaseRows data={data} query={query} mode={mode} onOpen={open} onRefresh={load} />}
      </StateView>
    </View>
  );
}

function CaseRows({ data, query, mode, onOpen, onRefresh }) {
  const read = useMemo(() => readCaseRows(data), [data]);
  const rows = useMemo(() => filterRows(read.rows, { query, mode }), [read, query, mode]);
  const typed = query.trim().toUpperCase();
  const exact = read.rows.some((r) => r.caseId.toUpperCase() === typed);
  const canOpenTyped = typed !== '' && !exact && CASE_ID_SHAPE.test(typed);

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
          onPress={() => onOpen(item.caseId)}
          accessibilityRole="button"
          accessibilityLabel={`${item.caseId}, ${item.capability.label}`}
        >
          <View style={s.rowMain}>
            <Text style={s.caseId}>{item.caseId}</Text>
            <Text style={s.detail}>{item.capability.detail}</Text>
            {!item.capability.consistent && <Text style={s.warn}>{item.capability.problem}</Text>}
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
    minHeight: MIN_TOUCH, borderWidth: 1, borderColor: color.border, borderRadius: 8, paddingHorizontal: space.m,
    color: color.text, backgroundColor: color.surface, fontFamily: font.mono, fontSize: font.body,
  },
  modes: { flexDirection: 'row', gap: space.s },
  mode: {
    flex: 1, minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface, paddingHorizontal: space.xs,
  },
  modeOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  modeT: { color: color.textDim, fontSize: font.small, fontWeight: '600', textAlign: 'center' },
  modeTOn: { color: color.accent },
  list: { paddingHorizontal: space.l, paddingBottom: space.xl },
  summary: { color: color.textDim, fontSize: font.small, marginBottom: space.s },
  note: { color: color.textDim, fontSize: font.small, marginBottom: space.s },
  openTyped: {
    borderWidth: 1, borderColor: color.accent, borderRadius: 8, padding: space.m, marginBottom: space.s,
    backgroundColor: color.accentBg, minHeight: MIN_TOUCH,
  },
  openTypedT: { color: color.accent, fontSize: font.body, fontWeight: '700', marginBottom: 2 },
  row: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, marginBottom: space.s,
    borderRadius: 10, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface,
  },
  rowMain: { flex: 1 },
  caseId: { color: color.text, fontFamily: font.mono, fontSize: font.h2, fontWeight: '700' },
  detail: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  warn: { color: color.warn, fontSize: font.small, marginTop: 2 },
  empty: { color: color.textDim, fontSize: font.body, textAlign: 'center', marginTop: space.xl },
  invalid: { marginTop: space.s, padding: space.m, borderRadius: 8, borderWidth: 1, borderColor: color.warn, backgroundColor: color.warnBg },
  invalidT: { color: color.warn, fontSize: font.small, fontFamily: font.mono },
});
