/*
 * SCR-07 - Experiment Comparison (V3, owner Bế Quốc Khánh). Day 22 skeleton,
 * built under the recovery override; the owner reviews and completes it from
 * D23.
 *
 * `10` SCR-07 asks for: UNet vs DINOv2, 25 / 50 / 100 %, aggregate /
 * distribution / trend, and case evidence links. The model is
 * createExperimentComparison (app/verticals/v3_study_and_compare, PR #61);
 * every string drawn here comes from v3View.mjs, which node --test checks.
 *
 *   params.experimentIds  optional - a pair or group opened from SCR-01.
 *                         Without it the screen shows the `08` section 2
 *                         matrix, filled from the server's experiment list.
 *
 * Choices with NO default, on purpose: the plotted metric (the contract does
 * not name the metrics yet - the chips are the names the server's summaries
 * use) and the statistic for trend and differences. Comparability is never
 * decided here: every label is the server's verdict, and a difference or a
 * trend line appears only under the server's COMPARABLE.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RECOVERY, STATE } from '../../../../app/core/index.mjs';
import { createExperimentComparison } from '../../../../app/verticals/v3_study_and_compare/index.mjs';
import StateView from '../../ui/StateView';
import { TONE } from '../../ui/stateCopy.mjs';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import StripChart from './StripChart';
import { Card, Chip, Line, LinkButton, Row, TONE_COLOR } from './V3Parts';
import { useSnapshot } from './useSnapshot';
import { comparisonView, pointDetail } from './v3View.mjs';

export default function ExperimentComparisonScreen({ runtime, nav, params }) {
  const ids = params && Array.isArray(params.experimentIds) ? params.experimentIds : null;
  const idsKey = ids ? ids.join(',') : '';
  const model = useMemo(() => createExperimentComparison(runtime.client), [runtime]);
  const [snap, run, setSnap] = useSnapshot(model);
  const [stat, setStat] = useState(null);
  const [cellId, setCellId] = useState(null);
  const [point, setPoint] = useState(null);
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    setPoint(null);
    run(() => model.open(ids ? { experimentIds: ids } : {}));
    // idsKey, not ids: a new array with the same ids is the same request.
  }, [model, idsKey, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((route) => {
    if (!route || !route.ok) { setBlocked(route ? route.reason : 'no link'); return; }
    setBlocked(null);
    nav.push(route.screenId, route.params);
  }, [nav]);

  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) nav.pop();
    else { setPoint(null); run(() => model.refresh()); }
  }, [nav, run, model]);

  const pickMetric = useCallback((name) => {
    setPoint(null);
    setSnap(model.selectMetric(name));
  }, [model, setSnap]);

  const ready = snap.view && snap.view.state === STATE.SUCCESS;
  const columns = useMemo(() => (ready ? model.stripColumns() : []), [ready, snap, model]);

  return (
    <StateView view={snap.view} what="the experiment comparison" onAction={onAction}>
      {() => (
        <Comparison
          v={comparisonView(snap, { stat, selectedCellId: cellId })}
          metricName={snap.metricName}
          columns={columns}
          point={point}
          onPoint={setPoint}
          onMetric={pickMetric}
          stat={stat}
          onStat={setStat}
          cellId={cellId}
          onCell={setCellId}
          go={go}
          blocked={blocked}
        />
      )}
    </StateView>
  );
}

function Comparison({ v, metricName, columns, point, onPoint, onMetric, stat, onStat, cellId, onCell, go, blocked }) {
  const detail = pointDetail(point, metricName);
  return (
    <ScrollView contentContainerStyle={s.root}>
      <Card title="What is compared" testID="scr07-header">
        <Line>{v.modeText}</Line>
        <Line dim small>{v.listText}</Line>
        <Line dim small>{v.outsideMatrixText}</Line>
      </Card>

      <Card title="Metric and statistic" testID="scr07-choices">
        <Line dim small>Nothing is pre-selected: pick what to plot and how to summarise it.</Line>
        {v.metric.emptyText ? <Line>{v.metric.emptyText}</Line> : (
          <Row>
            {v.metric.choices.map((m) => <Chip key={m} label={m} selected={m === v.metric.selected} onPress={() => onMetric(m)} />)}
          </Row>
        )}
        <Row>
          {v.stat.choices.map((st) => (
            <Chip key={st} label={st} selected={st === stat} onPress={() => onStat(st === stat ? null : st)} />
          ))}
        </Row>
      </Card>

      <Card title="UNet vs DINOv2 · 25 / 50 / 100 %" testID="scr07-matrix">
        {v.rows.map((row) => (
          <View key={row.family} style={s.family}>
            <Text style={s.familyLabel}>{row.label}</Text>
            {row.cells.map((cell) => (
              <TouchableOpacity
                key={cell.id}
                style={[s.cell, cell.id === cellId && s.cellOn]}
                onPress={() => onCell(cell.id === cellId ? null : cell.id)}
                accessibilityRole="button"
                accessibilityLabel={`${cell.title}: ${cell.statusText}`}
              >
                <Text style={s.cellTitle}>{`${cell.title} · ${cell.id}`}</Text>
                <Text style={[s.cellStatus, { color: TONE_COLOR[cell.tone] }]}>{cell.statusText}</Text>
                {cell.nText ? <Text style={s.mono}>{cell.nText}</Text> : null}
                {cell.summaryText ? <Text style={s.text}>{cell.summaryText}</Text> : null}
                {cell.contextText ? <Text style={s.small}>{cell.contextText}</Text> : null}
                {cell.contextMissing.length > 0 ? (
                  <Text style={[s.small, { color: TONE_COLOR[TONE.WARN] }]}>{`missing for D2: ${cell.contextMissing.join(', ')}`}</Text>
                ) : null}
                {cell.labels.map((l) => <Text key={l} style={s.small}>{l}</Text>)}
                {cell.warnings.slice(0, 2).map((w) => (
                  <Text key={w} style={[s.small, { color: TONE_COLOR[TONE.WARN] }]}>{w}</Text>
                ))}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </Card>

      <Card title={`Distribution per case${metricName ? ` - ${metricName}` : ''}`} testID="scr07-strip">
        <StripChart
          columns={columns}
          selected={point}
          onSelect={onPoint}
          label={`strip plot, one dot per successfully evaluated case${metricName ? `, ${metricName}` : ''}`}
        />
        <Line dim small>One dot per successfully evaluated case. A ring marks the server's DR-010 outliers. Tap a dot to see its case.</Line>
        {v.stripNotes.map((n) => <Line key={n} dim small>{n}</Line>)}
        {detail ? (
          <View style={s.detail}>
            <Line mono>{detail.text}</Line>
            <LinkButton label="Open this case (SCR-03)" route={detail.route} onGo={go} />
          </View>
        ) : null}
      </Card>

      <Card title="Comparisons (server verdicts)" testID="scr07-comparisons">
        {v.comparisons.map((c) => (
          <View key={c.id} style={s.comparison}>
            <Text style={s.text}>{c.label}</Text>
            <Text style={[s.small, { color: TONE_COLOR[c.tone] }]}>{c.verdictText}</Text>
            {c.reason ? <Text style={s.small}>{c.reason}</Text> : null}
            {c.populationText ? <Text style={s.small}>{c.populationText}</Text> : null}
            {c.deltaText ? <Text style={s.small}>{c.deltaText}</Text> : null}
          </View>
        ))}
      </Card>

      <Card title="Data-scarcity trend (RQ-A)" testID="scr07-trend">
        <Line dim small>{v.trendText}</Line>
        {v.trend.map((t) => (
          <View key={t.family} style={s.comparison}>
            <Text style={s.text}>{`${t.label}: ${t.pointsText}`}</Text>
            <Text style={s.small}>{t.text}</Text>
          </View>
        ))}
      </Card>

      {v.selected ? (
        <Card title={`Cases - ${v.selected.title} (${v.selected.id})`} testID="scr07-cases">
          <Line dim small>{v.selected.text}</Line>
          {v.selectedOutliers ? <Line dim small>{`Outliers: ${v.selectedOutliers.text}`}</Line> : null}
          {v.selectedOutliers && v.selectedOutliers.rows.map((o) => (
            <LinkButton key={`o-${o.key}`} label={`Outlier ${o.caseId} · ${o.valueText}`} route={o.route} onGo={go} />
          ))}
          {v.selected.rows.map((r) => (
            <View key={r.key} style={s.caseRow}>
              <Text style={s.mono}>{`${r.caseId} · ${r.statusText}${r.valueText ? ` · ${r.valueText}` : ''}`}</Text>
              {r.reason ? <Text style={s.small}>{`reason: ${r.reason}`}</Text> : null}
              <LinkButton label="Open case (SCR-03)" route={r.route} onGo={go} />
            </View>
          ))}
        </Card>
      ) : (
        <Card title="Cases">
          <Line dim small>Tap an experiment above to list every case the server returned for it, failed and excluded included.</Line>
        </Card>
      )}

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
  family: { marginTop: space.s, gap: space.s },
  familyLabel: { color: color.text, fontSize: font.body, fontWeight: '700' },
  cell: {
    minHeight: MIN_TOUCH, borderWidth: 1, borderColor: color.border, borderRadius: 8, padding: space.s,
    backgroundColor: color.surfaceHi,
  },
  cellOn: { borderColor: color.accent },
  cellTitle: { color: color.text, fontSize: font.small, fontWeight: '700' },
  cellStatus: { fontSize: font.small, marginTop: 2 },
  text: { color: color.text, fontSize: font.body, marginTop: 2 },
  small: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  mono: { color: color.text, fontFamily: font.mono, fontSize: 11, marginTop: 2 },
  detail: { marginTop: space.s, paddingTop: space.s, borderTopWidth: 1, borderTopColor: color.border },
  comparison: { borderTopWidth: 1, borderTopColor: color.border, paddingVertical: space.s },
  caseRow: { borderTopWidth: 1, borderTopColor: color.border, paddingVertical: space.s },
  blocked: { padding: space.m, borderRadius: 8, borderWidth: 1, borderColor: color.danger, backgroundColor: color.dangerBg },
  blockedT: { color: color.danger, fontSize: font.body },
});
