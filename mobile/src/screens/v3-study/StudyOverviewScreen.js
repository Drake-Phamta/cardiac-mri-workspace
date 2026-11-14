// SCR-01 Study Overview: the study, tiles for cases and findings, the median Dice of comparable pairs, the
// lowest-Dice cases, the experiments and every comparison, with links to each screen.
// Data comes from createStudyOverview (models.mjs); strings from overviewView (view.mjs) and the tiles (tiles.mjs).
// The experiment matrix shows no metric values: numbers appear only where the server judged runs comparable.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RECOVERY } from '../../api/states.mjs';
import { createStudyOverview } from './models.mjs';
import StateView from '../../components/StateView';
import { TONE } from '../../components/stateCopy.mjs';
import { color, font, MIN_TOUCH, space } from '../../components/theme';
import {
  Button, Card, Line, LinkButton, OutlierBar, Pill, Tile, TONE_COLOR, useSnapshot,
} from './parts';
import AboutDataSheet from './AboutDataSheet';
import { aboutData } from './about.mjs';
import { casesTile, diceTile, findingsTile } from './tiles.mjs';
import { FAMILY_STYLE, overviewView } from './view.mjs';

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
        return (
          <>
            <Overview v={v} snap={snap} go={go} blocked={blocked} onAbout={() => setAboutOpen(true)} />
            <AboutDataSheet
              visible={aboutOpen}
              sections={aboutData({ datasetText: v.study.datasetText, fixture: snap.source === 'fixture' })}
              onClose={() => setAboutOpen(false)}
            />
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
  return (
    <ScrollView contentContainerStyle={s.root}>
      <Card title={v.study.idText} testID="scr01-study">
        <Line tone={TONE.WARN} small>{v.study.idWarning}</Line>
        <Line>{`Dataset: ${v.study.datasetText}`}</Line>
        <Line dim small>{v.study.summaryText}</Line>
        {v.study.capabilities.length > 0 && (
          <Line dim small>{`Capabilities: ${v.study.capabilities.join(', ')}`}</Line>
        )}
        <Button label="About this data" onPress={onAbout} />
      </Card>

      <View style={s.tiles}>
        <Tile title="Cases" value={cases.value} text={cases.text} lines={cases.lines} testID="scr01-tile-cases">
          <LinkButton label="Open cases (SCR-02)" route={v.routes.cases} onGo={go} />
        </Tile>
        <Tile
          title="Findings"
          value={findings.open === null ? null : `${findings.open} open`}
          text={findings.resolved === null ? null : `${findings.resolved} resolved`}
          lines={[v.findings.text]}
          testID="scr01-tile-findings"
        >
          <LinkButton label="Open findings (SCR-08)" route={v.routes.findings} onGo={go} />
        </Tile>
      </View>

      <Card title="Median Dice, UNet vs DINOv2" testID="scr01-dice">
        <Line dim small>
          Dice: 0 to 1, higher is better. Shown only for pairs the server judged comparable. HD95 stays locked until
          the geometry is validated.
        </Line>
        {dice.emptyText ? <Line>{dice.emptyText}</Line> : null}
        {dice.rows.map((row) => (
          <TouchableOpacity
            key={row.id}
            style={[s.headline, !row.route.ok && s.headlineOff]}
            onPress={() => go(row.route)}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.chip}`}
          >
            <View style={s.diceHead}>
              <Text style={s.headlineLabel}>{row.label}</Text>
              <Pill label={row.chip} ok={row.fair} />
            </View>
            {row.fair ? (
              <Text style={s.diceValues}>
                <Text style={{ color: FAMILY_STYLE.UNET.color }}>● </Text>
                {`${row.unetText}   `}
                <Text style={{ color: FAMILY_STYLE.DINOV2.color }}>▲ </Text>
                {row.dinoText}
              </Text>
            ) : null}
            {row.note ? <Text style={s.small}>{row.note}</Text> : null}
          </TouchableOpacity>
        ))}
      </Card>

      <Card title="Lowest-Dice cases" testID="scr01-outliers">
        <Line dim small>{v.outliers.rule}</Line>
        <Line>{v.outliers.text}</Line>
        {v.outliers.groups.map((g) => (
          <View key={g.experimentId} style={s.family}>
            <Text style={s.familyLabel}>{`${g.title} · ${g.experimentId}`}</Text>
            <Line dim small>{g.view.text}</Line>
            {g.view.rows.map((o) => (
              <OutlierBar key={o.key} row={o} barColor={g.family ? FAMILY_STYLE[g.family].color : null} onGo={go} />
            ))}
          </View>
        ))}
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

      <Card title="All comparisons (server verdicts)" testID="scr01-headline">
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
            {h.summaryRows.map((row) => <Text key={row.experimentId} style={s.metric}>{row.text}</Text>)}
          </TouchableOpacity>
        ))}
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
  metric: { color: color.text, fontSize: font.small, marginTop: 4 },
  small: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  diceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  diceValues: { color: color.text, fontSize: font.h2, fontWeight: '600', marginTop: space.xs, fontVariant: font.numeric },
  blocked: { padding: space.m, borderRadius: 8, borderWidth: 1, borderColor: color.danger, backgroundColor: color.dangerBg },
  blockedT: { color: color.danger, fontSize: font.body },
});
