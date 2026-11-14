// SCR-01 Study Overview, Direction A: the dataset, "About this data", three counts, the median Dice of each
// UNet vs DINOv2 pair, and the lowest-Dice cases. Rows and hairlines, no cards.
// Data comes from createStudyOverview (models.mjs); strings from overviewView (view.mjs) and the tiles (tiles.mjs).
// Numbers appear only where the server judged runs comparable; anything else is a word and a reason.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RECOVERY } from '../../api/states.mjs';
import { createStudyOverview } from './models.mjs';
import StateView from '../../components/StateView';
import { TONE } from '../../components/stateCopy.mjs';
import { IconDatabase, IconOutline } from '../../components/icons';
import ListRow from '../../components/ListRow';
import MetricStrip from '../../components/MetricStrip';
import { color, space, type } from '../../components/theme';
import { Blocked, Note, Section, useSnapshot } from './parts';
import { FamilyLegend } from './charts';
import DiceRows from './DiceRows';
import AboutDataSheet from './AboutDataSheet';
import { aboutData, DATASET_SOURCE_NAME, studyDetails } from './about.mjs';
import { casesTile, diceTile, findingsTile } from './tiles.mjs';
import { overviewView } from './view.mjs';

export default function StudyOverviewScreen({ runtime, nav, params }) {
  // The study id comes from the build config unless the caller passed another one.
  const studyId = (params && params.studyId) || runtime.config.studyId;
  const model = useMemo(() => createStudyOverview(runtime.client), [runtime]);
  const [snap, run] = useSnapshot(model);
  const [blocked, setBlocked] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => { run(() => model.open({ studyId })); }, [model, studyId, run]);

  const go = useCallback((route) => {
    if (!route || !route.ok) { setBlocked(route ? route.reason : 'no link'); return; }
    setBlocked(null);
    nav.push(route.screenId, route.params);
  }, [nav]);

  // BACK leaves; every other recovery action (RETRY, REFRESH, REAUTH) loads again.
  const onAction = useCallback((id) => {
    if (id === RECOVERY.BACK) nav.pop();
    else run(() => model.refresh());
  }, [nav, run, model]);

  return (
    <StateView view={snap.view} what="the study overview" onAction={onAction}>
      {() => {
        const v = overviewView(snap);
        const sections = [
          ...aboutData({ datasetText: v.study.datasetText, fixture: snap.source === 'fixture' }),
          ...studyDetails({ summaryText: v.study.summaryText, capabilities: v.study.capabilities, outlierRule: v.outliers.rule }),
        ];
        return (
          <>
            <Overview v={v} snap={snap} go={go} blocked={blocked} onAbout={() => setAboutOpen(true)} />
            <AboutDataSheet visible={aboutOpen} sections={sections} onClose={() => setAboutOpen(false)} />
          </>
        );
      }}
    </StateView>
  );
}

function Overview({ v, snap, go, blocked, onAbout }) {
  const cases = casesTile(snap.caseCounts);
  const findings = findingsTile(snap.findings);
  const dice = diceTile(snap.headline);
  const comparable = dice.rows.filter((r) => r.fair).length;
  // What the server said about each pair: why it is not compared, or the population it was compared on.
  const diceNotes = [dice.emptyText, ...new Set(dice.rows.map((r) => r.note))].filter(Boolean);
  const fixture = snap.source === 'fixture';
  return (
    <ScrollView contentContainerStyle={s.page}>
      {v.study.idWarning ? <Note tone={TONE.WARN}>{v.study.idWarning}</Note> : null}

      <View style={s.dataset}>
        <View style={s.thumb}>
          <IconOutline size={40} color={color.t3} />
        </View>
        <View style={s.datasetText}>
          <Text style={s.overline}>Dataset</Text>
          <Text style={s.datasetName}>{v.study.datasetName || 'Dataset unavailable'}</Text>
          <Text style={s.datasetSource}>{fixture ? 'Generated placeholder data' : DATASET_SOURCE_NAME}</Text>
        </View>
      </View>
      <ListRow title="About this data" icon={IconDatabase} onPress={onAbout} divider="both" testID="scr01-about" />

      <MetricStrip
        style={s.strip}
        cells={[
          {
            label: 'Cases',
            value: cases.value === null ? '—' : cases.value,
            caption: cases.value === null ? cases.text : 'in this study',
            onPress: () => go(v.routes.cases),
            testID: 'scr01-tile-cases',
          },
          {
            label: 'Findings',
            value: findings.open === null ? '—' : String(findings.open),
            caption: 'open',
            onPress: () => go(v.routes.findings),
            testID: 'scr01-tile-findings',
          },
          {
            label: 'Resolved',
            value: findings.resolved === null ? '—' : String(findings.resolved),
            caption: 'findings',
            testID: 'scr01-tile-resolved',
          },
        ]}
      />
      <View style={s.counts}>
        {cases.lines.map((line) => {
          const [count, ...words] = line.split(' ');
          return (
            <Text key={line} style={s.countText}>
              <Text style={s.countNumber}>{count}</Text>
              {` ${words.join(' ')}`}
            </Text>
          );
        })}
      </View>
      {findings.open === null ? <View style={s.counts}><Note>{v.findings.text}</Note></View> : null}

      <Section
        title="Median Dice · UNet vs DINOv2"
        meta={dice.rows.length ? `${comparable} of ${dice.rows.length} comparable` : null}
        testID="scr01-median-dice"
      >
        <View style={s.legend}>
          <Text style={s.legendText}>0 to 1, higher is better</Text>
          <FamilyLegend style={s.legendKeys} />
        </View>
        <View style={s.diceRows}>
          <DiceRows rows={dice.rows} onGo={go} />
        </View>
        <View style={s.notes}>
          {diceNotes.map((text) => <Note key={text}>{text}</Note>)}
        </View>
      </Section>

      <View testID="scr01-outliers">
        {v.outliers.groups.length === 0 ? (
          <Section title="Lowest Dice"><Note>{v.outliers.text}</Note></Section>
        ) : v.outliers.groups.map((g) => (
          <Section
            key={g.experimentId}
            title={`Lowest Dice · ${g.title}`}
            meta={g.view.available ? g.view.variantText : null}
          >
            {g.view.available ? (
              <>
                {g.view.rows.map((o, i) => (
                  <OutlierRow key={o.key} row={o} first={i === 0} go={go} />
                ))}
                <Note>{g.view.warning}</Note>
              </>
            ) : <Note>{g.view.text}</Note>}
          </Section>
        ))}
      </View>

      <Blocked text={blocked} />
    </ScrollView>
  );
}

// One of the server's lowest-Dice cases: the id, a bar as long as the Dice (0 to 1), the Dice, a chevron.
function OutlierRow({ row, first, go }) {
  const common = {
    variant: 'meter',
    title: row.caseId,
    onPress: () => go(row.route),
    divider: first ? 'none' : 'top',
    accessibilityLabel: `${row.caseId}, ${row.valueText}`,
  };
  return (
    <>
      {row.bar === null ? (
        // No bar for a value that is missing or off the 0 to 1 scale: the value is a word, in the bar's place.
        <ListRow {...common} bar={null} trailing={<View style={s.noBar}><Text style={s.noBarText}>{row.scoreText}</Text></View>} />
      ) : (
        <ListRow {...common} bar={row.bar} barTone="warn" value={row.scoreText} />
      )}
      {row.route.ok ? null : <Note>{row.route.reason}</Note>}
    </>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: space.l, paddingBottom: space.xl },
  dataset: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingTop: space.s, paddingBottom: space.l },
  thumb: {
    width: 72, height: 72, borderRadius: 6, backgroundColor: color.viewer, borderWidth: 1, borderColor: color.hair,
    alignItems: 'center', justifyContent: 'center',
  },
  datasetText: { flex: 1 },
  overline: { ...type.overline, color: color.t3 },
  datasetName: { ...type.title, color: color.t1, marginTop: 2 },
  datasetSource: { ...type.secondary, color: color.t2 },
  strip: { marginTop: space.l },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.l, marginTop: space.s },
  countText: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
  countNumber: { fontWeight: '500', color: color.t1 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendText: { ...type.caption, color: color.t2 },
  legendKeys: { marginTop: 0 },
  diceRows: { marginTop: space.s },
  notes: { marginTop: space.s, gap: 2 },
  noBar: { flex: 1, alignItems: 'flex-end' },
  noBarText: { ...type.body, color: color.t3 },
});
