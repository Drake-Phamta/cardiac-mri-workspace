/*
 * SCR-01 - Study Overview (V3, owner Bế Quốc Khánh). Day 22 skeleton, built
 * under the recovery override; the owner reviews and completes it from D23.
 *
 * `10` SCR-01 asks for: study name/dataset, case count, available
 * experiments, high-level comparable metrics, outlier entry points, findings
 * summary; and the actions open cases / experiments / outlier case /
 * findings. Each comes from the framework-neutral model
 * createStudyOverview (app/verticals/v3_study_and_compare, PR #61); every
 * string drawn here comes from v3View.mjs, which node --test checks.
 *
 * What it deliberately does NOT show: per-experiment metric values. Two
 * numbers side by side read as a comparison, and here they would carry no
 * comparability label - SCR-07 shows them with the server's verdicts. This
 * screen shows N and status per experiment, and common-population numbers
 * only under the server's own COMPARABLE.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RECOVERY } from '../../../../app/core/index.mjs';
import { createStudyOverview } from '../../../../app/verticals/v3_study_and_compare/index.mjs';
import StateView from '../../ui/StateView';
import { TONE } from '../../ui/stateCopy.mjs';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import { Card, Chip, Line, LinkButton, Row, TONE_COLOR } from './V3Parts';
import { useSnapshot } from './useSnapshot';
import { overviewView } from './v3View.mjs';

export default function StudyOverviewScreen({ runtime, nav, params }) {
  // The study is the build's (scripts/prepare.mjs --study-id), unless a
  // caller opened this screen for another one. Never invented here.
  const studyId = (params && params.studyId) || runtime.config.studyId;
  const model = useMemo(() => createStudyOverview(runtime.client), [runtime]);
  const [snap, run] = useSnapshot(model);
  const [blocked, setBlocked] = useState(null);

  useEffect(() => { run(() => model.open({ studyId })); }, [model, studyId, run]);

  const go = useCallback((route) => {
    if (!route || !route.ok) { setBlocked(route ? route.reason : 'no link'); return; }
    setBlocked(null);
    nav.push(route.screenId, route.params);
  }, [nav]);

  // RETRY, REFRESH and REAUTH all re-request; BACK leaves. app/core decided
  // which of them this state offers.
  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) nav.pop();
    else run(() => model.refresh());
  }, [nav, run, model]);

  return (
    <StateView view={snap.view} what="the study overview" onAction={onAction}>
      {() => <Overview v={overviewView(snap)} go={go} blocked={blocked} />}
    </StateView>
  );
}

function Overview({ v, go, blocked }) {
  return (
    <ScrollView contentContainerStyle={s.root}>
      <Card title={v.study.idText} testID="scr01-study">
        <Line tone={TONE.WARN} small>{v.study.idWarning}</Line>
        <Line>{`Dataset: ${v.study.datasetText}`}</Line>
        <Line dim small>{v.study.summaryText}</Line>
        {v.study.counts.map((c) => <Line key={c.key}>{`Cases (${c.key}): ${c.text}`}</Line>)}
        <Line dim>{v.study.countsText}</Line>
        {v.study.capabilities.length > 0 && (
          <Line dim small>{`Capabilities: ${v.study.capabilities.join(', ')}`}</Line>
        )}
        <LinkButton label="Open cases (SCR-02)" route={v.routes.cases} onGo={go} />
      </Card>

      <Card title="Experiments" testID="scr01-experiments">
        <Line>{v.experiments.text}</Line>
        {v.experiments.notes.map((n) => <Line key={n} dim small>{n}</Line>)}
        {v.experiments.rows.map((row) => (
          <View key={row.family} style={s.family}>
            <Text style={s.familyLabel}>{row.label}</Text>
            <View style={s.cells}>
              {row.cells.map((cell) => (
                <View key={cell.id} style={s.cell}>
                  <Text style={s.cellTitle}>{cell.title}</Text>
                  <Text style={[s.cellStatus, { color: TONE_COLOR[cell.tone] }]}>{cell.statusText}</Text>
                  {cell.nText ? <Text style={s.cellN}>{cell.nText}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ))}
        <LinkButton label="Open the comparison (SCR-07)" route={v.routes.experiments} onGo={go} />
      </Card>

      <Card title="Comparable metrics (server verdicts)" testID="scr01-headline">
        <Line dim small>
          Numbers appear here only where the server judged the runs comparable; anything else is a label and a reason.
        </Line>
        {v.headline.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[s.headline, !h.route.ok && s.headlineOff]}
            onPress={() => go(h.route)}
            accessibilityRole="button"
            accessibilityLabel={`${h.label}: ${h.verdictText}`}
          >
            <Text style={s.headlineLabel}>{h.label}</Text>
            <Text style={[s.headlineVerdict, { color: TONE_COLOR[h.tone] }]}>{h.verdictText}</Text>
            {h.reason ? <Text style={s.small}>{h.reason}</Text> : null}
            {h.populationText ? <Text style={s.small}>{h.populationText}</Text> : null}
          </TouchableOpacity>
        ))}
      </Card>

      <Card title="Outliers (DR-010)" testID="scr01-outliers">
        <Line dim small>{v.outliers.rule}</Line>
        <Line>{v.outliers.text}</Line>
        {v.outliers.groups.map((g) => (
          <View key={g.experimentId} style={s.family}>
            <Text style={s.familyLabel}>{`${g.title} · ${g.experimentId}`}</Text>
            <Line dim small>{g.view.text}</Line>
            {g.view.rows.map((o) => (
              <LinkButton key={o.key} label={`${o.caseId} · ${o.valueText}`} route={o.route} onGo={go} />
            ))}
          </View>
        ))}
      </Card>

      <Card title="Findings" testID="scr01-findings">
        <Line>{v.findings.text}</Line>
        {v.findings.byStatus.length > 0 && (
          <Row>{v.findings.byStatus.map((t) => <Chip key={t} label={t} selected={false} onPress={() => go(v.routes.findings)} />)}</Row>
        )}
        <LinkButton label="Open findings (SCR-08)" route={v.routes.findings} onGo={go} />
      </Card>

      {blocked ? (
        <View style={s.blocked} accessibilityRole="alert">
          <Text style={s.blockedT}>{`Cannot open: ${blocked}`}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.l, gap: space.m },
  family: { marginTop: space.s },
  familyLabel: { color: color.text, fontSize: font.body, fontWeight: '700' },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.xs },
  cell: {
    minWidth: 96, flexGrow: 1, flexBasis: 96, borderWidth: 1, borderColor: color.border, borderRadius: 8,
    padding: space.s, backgroundColor: color.surfaceHi,
  },
  cellTitle: { color: color.text, fontSize: font.small, fontWeight: '700' },
  cellStatus: { fontSize: font.small, marginTop: 2 },
  cellN: { color: color.text, fontFamily: font.mono, fontSize: 11, marginTop: 2 },
  headline: {
    minHeight: MIN_TOUCH, borderTopWidth: 1, borderTopColor: color.border, paddingVertical: space.s,
  },
  headlineOff: { opacity: 0.7 },
  headlineLabel: { color: color.text, fontSize: font.body, fontWeight: '600' },
  headlineVerdict: { fontSize: font.small, marginTop: 2 },
  small: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  blocked: { padding: space.m, borderRadius: 8, borderWidth: 1, borderColor: color.danger, backgroundColor: color.dangerBg },
  blockedT: { color: color.danger, fontSize: font.body },
});
