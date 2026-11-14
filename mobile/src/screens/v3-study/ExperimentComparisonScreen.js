// SCR-07 Experiment Comparison, Direction A: sections of dense rows with one value each. The experiment list, the
// comparisons and the trend rows open a sheet for everything else (ids, mean, q1, q3, N, the server's verdicts and
// reasons); the per-case charts keep their validated colours and marker shapes.
// Opened with params.experimentIds for a pair or group, else the full matrix. The metric has no default, the
// statistic is the median, and comparability is always the server's verdict, never decided here.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RECOVERY, STATE } from '../../api/states.mjs';
import { createExperimentComparison } from './models.mjs';
import { CELL_STATUS } from './cohort.mjs';
import StateView from '../../components/StateView';
import { SegmentedControl } from '../../components/Controls';
import DetailsSheet, { Sheet } from '../../components/DetailsSheet';
import { IconDatabase, IconInfo } from '../../components/icons';
import ListRow, { SectionLabel } from '../../components/ListRow';
import { space } from '../../components/theme';
import {
  Blocked, Body, ExperimentRow, InfoRow, LinkRow, MetricLegend, Note, Section, StripChart, useSnapshot, ValueRow,
} from './parts';
import AboutDataSheet from './AboutDataSheet';
import { aboutData, metricLabel, runDetails } from './about.mjs';
import { FamilyLegend, PairedChart, TrendChart } from './charts';
import { pairDetail, pairedCards } from './paired.mjs';
import { trendNotes, trendSeries } from './trend.mjs';
import { comparisonView, OUTLIER_LABEL, plainText, pointDetail } from './view.mjs';

// The page shows medians: the mean, q1 and q3 are in an experiment's details.
const STAT = 'median';

export default function ExperimentComparisonScreen({ runtime, nav, params }) {
  const ids = params && Array.isArray(params.experimentIds) ? params.experimentIds : null;
  const idsKey = ids ? ids.join(',') : '';
  const model = useMemo(() => createExperimentComparison(runtime.client), [runtime]);
  const [snap, run, setSnap] = useSnapshot(model);
  const [cellId, setCellId] = useState(null);
  const [compareId, setCompareId] = useState(null);
  const [trendFamily, setTrendFamily] = useState(null);
  const [point, setPoint] = useState(null);
  // The tapped dot of a paired chart: { cardId, pair }.
  const [paired, setPaired] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [sheet, setSheet] = useState(null); // 'about' | 'metrics' | null

  useEffect(() => {
    setPoint(null);
    setPaired(null);
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
    else { setPoint(null); setPaired(null); run(() => model.refresh()); }
  }, [nav, run, model]);

  const pickMetric = useCallback((name) => {
    setPoint(null);
    setPaired(null);
    setSnap(model.selectMetric(name));
  }, [model, setSnap]);

  const ready = snap.view && snap.view.state === STATE.SUCCESS;
  const columns = useMemo(() => (ready ? model.stripColumns() : []), [ready, snap, model]);

  return (
    <StateView view={snap.view} what="the experiment comparison" onAction={onAction}>
      {() => {
        const v = comparisonView(snap, { stat: STAT, selectedCellId: cellId });
        const cells = v.rows.flatMap((row) => row.cells);
        // The lines the page leaves out: how the matrix was filled, the server's list, each run's context.
        const details = [v.modeText, v.listText, v.outsideMatrixText, ...cells.map((cell) => cell.contextText)].filter(Boolean);
        const trend = trendSeries(snap.cells, snap.comparisons, snap.metricName);
        return (
          <>
            <Comparison
              v={v}
              cells={cells}
              pairs={pairedCards(snap)}
              trend={trend}
              metricName={snap.metricName}
              columns={columns}
              point={point}
              onPoint={setPoint}
              paired={paired}
              onPaired={setPaired}
              onMetric={pickMetric}
              onCell={setCellId}
              onCompare={setCompareId}
              onTrend={setTrendFamily}
              go={go}
              blocked={blocked}
              onSheet={setSheet}
            />
            <AboutDataSheet
              visible={sheet === 'about'}
              sections={[...aboutData({ fixture: snap.source === 'fixture' }), ...runDetails(details)]}
              onClose={() => setSheet(null)}
            />
            <Sheet visible={sheet === 'metrics'} onClose={() => setSheet(null)} title="Metric definitions" testID="metric-sheet">
              <MetricLegend selected={snap.metricName} />
            </Sheet>
            <ExperimentSheet
              cell={cells.find((c) => c.id === cellId) || null}
              v={v}
              go={(route) => { if (route && route.ok) setCellId(null); go(route); }}
              onClose={() => setCellId(null)}
            />
            <ComparisonSheet comparison={v.comparisons.find((c) => c.id === compareId) || null} onClose={() => setCompareId(null)} />
            <TrendSheet
              row={v.trend.find((t) => t.family === trendFamily) || null}
              verdict={v.comparisons.find((c) => c.kind === 'TREND' && c.family === trendFamily) || null}
              notes={trendNotes(trend)}
              onClose={() => setTrendFamily(null)}
            />
          </>
        );
      }}
    </StateView>
  );
}

function Comparison({
  v, cells, pairs, trend, metricName, columns, point, onPoint, paired, onPaired, onMetric, onCell, onCompare, onTrend, go, blocked,
  onSheet,
}) {
  const detail = pointDetail(point, metricName);
  // Opened for a pair, the runs and comparisons that were not asked for are left out; with the full matrix they stay,
  // each saying in words that it is not listed or not compared.
  const listed = v.explicit ? cells.filter((c) => c.status !== CELL_STATUS.NOT_REQUESTED) : cells;
  const comparisons = v.comparisons.filter((c) => c.kind !== 'TREND' && (!v.explicit || c.requested));
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.top}>
        <ListRow title="About this data" icon={IconDatabase} onPress={() => onSheet('about')} divider="top" testID="scr07-about" />
        <ListRow title="Metric definitions" icon={IconInfo} onPress={() => onSheet('metrics')} divider="both" testID="scr07-metrics" />
      </View>

      <Section title="Metric" testID="scr07-choices">
        {v.metric.emptyText ? <Body>{v.metric.emptyText}</Body> : (
          // Up to five metrics: a segmented control wider than the screen scrolls sideways.
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <SegmentedControl
              label="Metric"
              value={v.metric.selected}
              onChange={onMetric}
              options={v.metric.choices.map((m) => ({ value: m, label: metricLabel(m) }))}
            />
          </ScrollView>
        )}
        {!v.metric.emptyText && !v.metric.selected ? <Note>Pick a metric to see values.</Note> : null}
      </Section>

      <Section title="Experiments" meta={metricName ? `${metricLabel(metricName)} · median` : null} testID="scr07-matrix">
        {listed.map((cell, i) => <ExperimentRow key={cell.id} cell={cell} first={i === 0} onPress={() => onCell(cell.id)} />)}
      </Section>

      <Section title="Distribution per case" meta={metricName ? metricLabel(metricName) : null} testID="scr07-strip">
        <StripChart
          columns={columns}
          selected={point}
          onSelect={onPoint}
          label={`strip plot, one dot per successfully evaluated case${metricName ? `, ${metricLabel(metricName)}` : ''}`}
        />
        <Note>{`One dot per case · a ring marks the ${OUTLIER_LABEL} · tap a dot`}</Note>
        {v.plotNotes.map((text) => <Note key={text}>{text}</Note>)}
        {detail ? (
          <View style={s.detail}>
            <Body>{detail.title}</Body>
            <Note>{detail.caption}</Note>
            <LinkRow title="Open this case" route={detail.route} onGo={go} />
          </View>
        ) : null}
      </Section>

      <Section title="Comparisons" testID="scr07-comparisons">
        {comparisons.map((c, i) => (
          <ValueRow
            key={c.id}
            title={c.rowLabel}
            value={c.deltaValueText}
            muted={c.fair ? null : 'Not compared'}
            first={i === 0}
            onPress={() => onCompare(c.id)}
          />
        ))}
      </Section>

      <Section title="Per-case differences" testID="scr07-paired">
        <Note>One dot per case, lowest difference on the left · tap a dot</Note>
        <Body>{pairs.emptyText}</Body>
        {pairs.cards.map((card) => (
          <PairedSection key={card.id} card={card} paired={paired} onPaired={onPaired} go={go} />
        ))}
      </Section>

      <Section title="Trend over 25 → 50 → 100 %" testID="scr07-trend">
        {trend.length ? (
          <>
            <TrendChart series={trend} label={`trend of ${metricLabel(metricName)} over 25, 50 and 100 % training data`} />
            <FamilyLegend />
            <Note>Dots: cases · bar: q1 to q3 · tick: median</Note>
          </>
        ) : <Note>Pick a metric to draw the trend.</Note>}
        {v.trend.map((t, i) => (
          <ValueRow
            key={t.family}
            title={t.rowLabel}
            muted={t.connected ? null : 'Not joined'}
            first={i === 0}
            onPress={() => onTrend(t.family)}
          />
        ))}
      </Section>

      <Blocked text={blocked} />
    </ScrollView>
  );
}

// One requested UNet vs DINOv2 pair: the chart when the server judged it comparable, otherwise why not.
function PairedSection({ card, paired, onPaired, go }) {
  const selected = paired && paired.cardId === card.id ? paired.pair : null;
  const detail = pairDetail(selected, card);
  const title = card.title.replace(' at ', ' · ');
  if (!card.available) return <InfoRow title={title} state={`Not shown: ${plainText(card.reason)}`} />;
  return (
    <InfoRow title={title} notes={[card.captionText]}>
      <PairedChart card={card} selected={selected} onSelect={(pair) => onPaired(pair ? { cardId: card.id, pair } : null)} />
      <Note>{card.unpairedShort}</Note>
      {detail ? (
        <View style={s.detail}>
          <Body>{detail.text}</Body>
          {detail.links.map((l) => <LinkRow key={l.label} title={l.label} route={l.route} onGo={go} />)}
        </View>
      ) : null}
    </InfoRow>
  );
}

const lines = (...all) => all.flat().filter(Boolean);

// Everything about one experiment: its id, status, N, summary (median, mean, q1, q3), the server's verdicts, and its
// cases with a link to each.
function ExperimentSheet({ cell, v, go, onClose }) {
  if (!cell) return null;
  const sections = [
    {
      title: 'Run',
      lines: lines(`Experiment ${cell.id}`, cell.statusText, cell.nText, cell.summaryText, cell.contextText,
        cell.contextMissing.length ? `context missing: ${cell.contextMissing.join(', ')}` : null),
    },
    { title: 'Comparability', lines: cell.labels },
    { title: 'Warnings', lines: cell.warnings },
  ].filter((sec) => sec.lines.length > 0);
  return (
    <DetailsSheet visible title={cell.title} sections={sections} onClose={onClose} testID="experiment-details">
      {v.selected ? (
        <View testID="scr07-cases">
          <SectionLabel title="Cases" />
          <View style={s.sheetRows}>
            <Note>{v.selected.text}</Note>
            {v.selectedOutliers ? <Note>{`Outliers: ${v.selectedOutliers.text}`}</Note> : null}
            {v.selectedOutliers && v.selectedOutliers.rows.map((o) => (
              <LinkRow key={`o-${o.key}`} title={`Outlier ${o.caseId} · ${o.valueText}`} route={o.route} onGo={go} />
            ))}
            {v.selected.rows.map((r) => (
              <LinkRow
                key={r.key}
                title={`${r.caseId} · ${r.statusText}${r.valueText ? ` · ${r.valueText}` : ''}`}
                notes={r.reason ? [`reason: ${r.reason}`] : []}
                route={r.route}
                onGo={go}
              />
            ))}
          </View>
        </View>
      ) : null}
    </DetailsSheet>
  );
}

// One comparison: the server's verdict and reason, the population, both medians and their difference.
function ComparisonSheet({ comparison, onClose }) {
  if (!comparison) return null;
  const sections = [
    { title: 'Verdict', lines: lines(comparison.verdictText, comparison.reason, comparison.populationText) },
    { title: 'Difference', lines: lines(comparison.deltaText) },
    { title: 'Values', lines: comparison.summaryRows.map((r) => r.text) },
  ].filter((sec) => sec.lines.length > 0);
  return <DetailsSheet visible title={comparison.rowLabel} sections={sections} onClose={onClose} testID="comparison-details" />;
}

// One family's trend: its values per run, whether the runs are joined and why not.
function TrendSheet({ row, verdict, notes, onClose }) {
  if (!row) return null;
  const sections = [
    { title: 'Values', lines: lines(row.pointsText) },
    // The notes name each family; this sheet is about one, so the other family's note is left out.
    { title: 'Line', lines: lines(row.text, notes.filter((n) => n.startsWith(`${row.label}:`) || !/^(UNet|DINOv2):/.test(n))) },
    { title: 'Verdict', lines: verdict ? lines(verdict.verdictText, verdict.populationText) : [] },
  ].filter((sec) => sec.lines.length > 0);
  return <DetailsSheet visible title={row.rowLabel} sections={sections} onClose={onClose} testID="trend-details" />;
}

const s = StyleSheet.create({
  page: { paddingHorizontal: space.l, paddingBottom: space.xl },
  top: { paddingTop: space.s },
  detail: { marginTop: space.s },
  sheetRows: { marginTop: space.xs },
});
