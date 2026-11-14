// SCR-07 Experiment Comparison, Direction A: UNet vs DINOv2 at 25 / 50 / 100 % data, per-case strip plot, paired
// per-case differences, trend and case links, as sections of rows under hairlines.
// Opened with params.experimentIds for a pair or group, else the full matrix. The metric and statistic have no
// default, and comparability is always the server's verdict, never decided here.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RECOVERY, STATE } from '../../api/states.mjs';
import { createExperimentComparison } from './models.mjs';
import StateView from '../../components/StateView';
import { SegmentedControl } from '../../components/Controls';
import { IconDatabase } from '../../components/icons';
import ListRow from '../../components/ListRow';
import { color, space, type } from '../../components/theme';
import {
  Blocked, Body, CellRow, InfoRow, LinkRow, MetricLegend, Note, Section, StripChart, useSnapshot,
} from './parts';
import AboutDataSheet from './AboutDataSheet';
import { aboutData, metricLabel, runDetails } from './about.mjs';
import { FamilyKey, FamilyLegend, PairedChart, TrendChart } from './charts';
import { pairDetail, pairedCards } from './paired.mjs';
import { trendNotes, trendSeries } from './trend.mjs';
import { comparisonView, OUTLIER_LABEL, pointDetail } from './view.mjs';

export default function ExperimentComparisonScreen({ runtime, nav, params }) {
  const ids = params && Array.isArray(params.experimentIds) ? params.experimentIds : null;
  const idsKey = ids ? ids.join(',') : '';
  const model = useMemo(() => createExperimentComparison(runtime.client), [runtime]);
  const [snap, run, setSnap] = useSnapshot(model);
  const [stat, setStat] = useState(null);
  const [cellId, setCellId] = useState(null);
  const [point, setPoint] = useState(null);
  // The tapped dot of a paired chart: { cardId, pair }.
  const [paired, setPaired] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);

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
        const v = comparisonView(snap, { stat, selectedCellId: cellId });
        // Each run's context line (cohort level, population, N, metric version) is technical: it lives in the sheet.
        const contexts = v.rows.flatMap((row) => row.cells).map((cell) => cell.contextText).filter(Boolean);
        return (
          <>
            <Comparison
              v={v}
              pairs={pairedCards(snap)}
              trend={trendSeries(snap.cells, snap.comparisons, snap.metricName)}
              metricName={snap.metricName}
              columns={columns}
              point={point}
              onPoint={setPoint}
              paired={paired}
              onPaired={setPaired}
              onMetric={pickMetric}
              stat={stat}
              onStat={setStat}
              cellId={cellId}
              onCell={setCellId}
              go={go}
              blocked={blocked}
              onAbout={() => setAboutOpen(true)}
            />
            <AboutDataSheet
              visible={aboutOpen}
              sections={[...aboutData({ fixture: snap.source === 'fixture' }), ...runDetails(contexts)]}
              onClose={() => setAboutOpen(false)}
            />
          </>
        );
      }}
    </StateView>
  );
}

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);

function Comparison({
  v, pairs, trend, metricName, columns, point, onPoint, paired, onPaired, onMetric, stat, onStat, cellId, onCell, go, blocked,
  onAbout,
}) {
  const detail = pointDetail(point, metricName);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.intro} testID="scr07-header">
        <Body>{v.modeText}</Body>
        <Note>{v.listText}</Note>
        <Note>{v.outsideMatrixText}</Note>
      </View>
      <ListRow title="About this data" icon={IconDatabase} onPress={onAbout} divider="both" />

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
        {v.metric.emptyText ? null : <Note>Nothing is pre-selected: pick what to plot and how to summarise it.</Note>}
      </Section>
      <Section title="Statistic">
        <SegmentedControl
          label="Statistic"
          value={stat}
          onChange={(st) => onStat(st === stat ? null : st)}
          options={v.stat.choices.map((st) => ({ value: st, label: capitalise(st) }))}
        />
      </Section>
      <Section title="What the metrics mean">
        <MetricLegend selected={metricName} />
      </Section>

      <Section title="UNet vs DINOv2 · 25 / 50 / 100 %" testID="scr07-matrix">
        {v.rows.map((row) => (
          <View key={row.family} style={s.family}>
            <View style={s.familyHead}>
              <FamilyKey group={row.family} />
              <Text style={s.familyName}>{row.label}</Text>
            </View>
            {row.cells.map((cell) => (
              <CellRow key={cell.id} cell={cell} selected={cell.id === cellId} onPress={() => onCell(cell.id === cellId ? null : cell.id)} />
            ))}
          </View>
        ))}
      </Section>

      <Section title="Distribution per case" meta={metricName ? metricLabel(metricName) : null} testID="scr07-strip">
        <StripChart
          columns={columns}
          selected={point}
          onSelect={onPoint}
          label={`strip plot, one dot per successfully evaluated case${metricName ? `, ${metricName}` : ''}`}
        />
        <Note>{`One dot per successfully evaluated case. A ring marks the server's ${OUTLIER_LABEL}. Tap a dot to see its case.`}</Note>
        {v.stripNotes.map((text) => <Note key={text}>{text}</Note>)}
        {detail ? (
          <View style={s.detail}>
            <Body>{detail.text}</Body>
            <LinkRow title="Open this case" route={detail.route} onGo={go} />
          </View>
        ) : null}
      </Section>

      <Section title="Comparisons (server verdicts)" testID="scr07-comparisons">
        {v.comparisons.map((c) => (
          <InfoRow key={c.id} title={c.label} state={c.verdictText} tone={c.tone} notes={[c.reason, c.populationText, c.deltaText]} />
        ))}
      </Section>

      <Section title="Per-case differences" testID="scr07-paired">
        <Note>
          Only for two runs the server judged comparable. One dot per case: its value in the second run minus the
          first, lowest on the left. Tap a dot, then open the case in either run.
        </Note>
        <Body>{pairs.emptyText}</Body>
        {pairs.notRequested.map((text) => <Note key={text}>{text}</Note>)}
        {pairs.cards.map((card) => (
          <PairedSection key={card.id} card={card} paired={paired} onPaired={onPaired} go={go} />
        ))}
      </Section>

      <Section title="Trend over 25 → 50 → 100 % data" testID="scr07-trend">
        {trend.length ? (
          <>
            <TrendChart series={trend} label={`trend of ${metricName} over 25, 50 and 100 % training data`} />
            <FamilyLegend />
            <Note>
              {'Markers: every case. Bar: the middle half of the cases (q1 to q3); tick: the median, both from the '
                + "server's summary. A line and band join the runs only where the server judged them comparable."}
            </Note>
            {trendNotes(trend).map((text) => <Note key={text}>{text}</Note>)}
          </>
        ) : <Note>Pick a metric above to draw the trend.</Note>}
        <Note>{v.trendText}</Note>
        {v.trend.map((t) => <InfoRow key={t.family} title={`${t.label}: ${t.pointsText}`} notes={[t.text]} />)}
      </Section>

      {v.selected ? (
        <Section title={`Cases · ${v.selected.title} · ${v.selected.id}`} testID="scr07-cases">
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
        </Section>
      ) : (
        <Section title="Cases">
          <Note>Tap an experiment above to list every case the server returned for it, failed and excluded included.</Note>
        </Section>
      )}

      <Blocked text={blocked} />
    </ScrollView>
  );
}

// One requested UNet vs DINOv2 pair: the chart when the server judged it comparable, otherwise why not.
function PairedSection({ card, paired, onPaired, go }) {
  const selected = paired && paired.cardId === card.id ? paired.pair : null;
  const detail = pairDetail(selected, card);
  if (!card.available) return <InfoRow title={card.title} state={`Not shown: ${card.reason}`} />;
  return (
    <InfoRow title={card.title} notes={[card.summaryText]}>
      <PairedChart card={card} selected={selected} onSelect={(pair) => onPaired(pair ? { cardId: card.id, pair } : null)} />
      <Note>{card.directionText}</Note>
      <Note>{card.unpairedText}</Note>
      {detail ? (
        <View style={s.detail}>
          <Body>{detail.text}</Body>
          {detail.links.map((l) => <LinkRow key={l.label} title={l.label} route={l.route} onGo={go} />)}
        </View>
      ) : null}
    </InfoRow>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: space.l, paddingBottom: space.xl },
  intro: { paddingTop: space.s, paddingBottom: space.m, gap: 2 },
  family: { marginTop: space.s },
  familyHead: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingBottom: space.xs },
  familyName: { ...type.body, fontWeight: '500', color: color.t1 },
  detail: { marginTop: space.s },
});
