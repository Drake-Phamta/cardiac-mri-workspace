// Small UI pieces shared by SCR-01 and SCR-07, in Direction A: plain text, rows under hairlines, no cards.
// No data logic: every string they draw comes from the .mjs files.
// Status is always words next to its colour, never colour alone, and every tap target is at least MIN_TOUCH.

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import Svg, { Circle, G, Line as SvgLine, Text as SvgText } from 'react-native-svg';

import { TONE } from '../../components/stateCopy.mjs';
import { color, font, HAIRLINE, MIN_TOUCH, size, space, type } from '../../components/theme';
import { IconAlert, IconChevronRight } from '../../components/icons';
import { MiniBar, SectionLabel } from '../../components/ListRow';
import { pointAt, stripLayout, FAMILY_LABEL } from './view.mjs';
import { FamilyKey, FamilyLegend, Marker } from './charts';
import { LOCKED_METRICS, METRIC_LEGEND } from './about.mjs';
import { fatalInvalid, RECOVERY } from '../../api/states.mjs';

export const TONE_COLOR = Object.freeze({
  [TONE.NEUTRAL]: color.t2,
  [TONE.INFO]: color.accent,
  [TONE.WARN]: color.warn,
  [TONE.DANGER]: color.danger,
});

// A caption line (12 dp, t3). `tone` colours a state that needs a look (warn, danger); a word always says it too.
export function Note({ children, tone = null }) {
  if (children === null || children === undefined || children === '') return null;
  return <Text style={[s.note, tone && { color: TONE_COLOR[tone] || color.t2 }]}>{children}</Text>;
}

// A text line in the body size (14 dp, t1).
export function Body({ children }) {
  if (children === null || children === undefined || children === '') return null;
  return <Text style={s.body}>{children}</Text>;
}

// A section of a page: the overline (with an optional caption on its right), then the content 4 dp below it.
export function Section({ title, meta = null, children, testID }) {
  return (
    <View style={s.section} testID={testID}>
      <SectionLabel title={title} meta={meta} />
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

// A row that only reads: a title, a state in words (coloured by its tone) and caption lines, under a hairline.
export function InfoRow({ title, state = null, tone = TONE.NEUTRAL, notes = [], children }) {
  return (
    <View style={s.infoRow}>
      {title ? <Text style={s.rowTitle}>{title}</Text> : null}
      {state ? <Text style={[s.state, { color: TONE_COLOR[tone] }]}>{state}</Text> : null}
      {notes.filter(Boolean).map((text) => <Text key={text} style={s.note}>{text}</Text>)}
      {children}
    </View>
  );
}

// A row that opens another screen: a title, optional caption lines and a chevron. A link that cannot open shows
// its reason under the title, so a tap never silently does nothing.
export function LinkRow({ title, notes = [], route, onGo, accessibilityLabel, testID }) {
  const ok = Boolean(route && route.ok);
  return (
    <TouchableOpacity
      style={s.linkRow}
      onPress={() => onGo(route)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !ok }}
      testID={testID}
    >
      <View style={s.rowText}>
        <Text style={[s.rowTitle, !ok && s.rowTitleOff]}>{title}</Text>
        {notes.map((text) => <Text key={text} style={s.note}>{text}</Text>)}
        {!ok && route && route.reason ? <Text style={s.note}>{route.reason}</Text> : null}
      </View>
      {ok ? <IconChevronRight size={16} color={color.t3} /> : null}
    </TouchableOpacity>
  );
}

// One experiment of the list, as a dense row like the case rows: the family marker, "UNet 25 %", a secondary line
// ("5 of 5 cases", or a status in words when the run is not simply loaded), then the chosen metric's median as a
// bar and a number. Tap it for everything else about the run.
export function ExperimentRow({ cell, first, onPress }) {
  const sub = cell.statusWord || cell.casesText;
  return (
    <TouchableOpacity
      style={[s.expRow, !first && s.rowLine]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cell.title}${cell.valueText ? `, ${cell.valueText}` : ''}${sub ? `, ${sub}` : ''}`}
    >
      <View style={s.expKey}><FamilyKey group={cell.family} /></View>
      <View style={s.rowText}>
        <Text style={s.rowTitle}>{cell.title}</Text>
        {sub ? <Text style={[s.note, cell.statusWord && { color: TONE_COLOR[cell.tone] }]}>{sub}</Text> : null}
      </View>
      {cell.bar !== null ? <MiniBar value={cell.bar} style={s.expBar} /> : null}
      {cell.valueText ? <Text style={s.expValue}>{cell.valueText}</Text> : null}
      <IconChevronRight size={16} color={color.t3} />
    </TouchableOpacity>
  );
}

// A row with one value on its right and the rest on tap: a comparison ("UNet vs DINOv2 · 25 %", "+0.030") or a
// trend. `value` is the number; `muted` is a word in t3 ("Not compared") shown when there is no number.
export function ValueRow({ title, value = null, muted = null, first, onPress }) {
  return (
    <TouchableOpacity
      style={[s.valueRow, !first && s.rowLine]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, value || muted].filter(Boolean).join(', ')}
    >
      <Text style={[s.rowTitle, s.rowGrow]}>{title}</Text>
      {value ? <Text style={s.expValue}>{value}</Text> : null}
      {!value && muted ? <Text style={s.mutedText}>{muted}</Text> : null}
      <IconChevronRight size={16} color={color.t3} />
    </TouchableOpacity>
  );
}

// What each metric means (about.mjs), the picked one brighter; metrics in mm or mL are listed as locked.
export function MetricLegend({ selected = null }) {
  return (
    <View style={s.legend} testID="metric-legend">
      {METRIC_LEGEND.map((m) => (
        <Text key={m.name} style={[s.legendLine, m.name === selected && s.legendOn]}>
          <Text style={s.legendName}>{m.label}</Text>
          {`: ${m.text}`}
        </Text>
      ))}
      {LOCKED_METRICS.map((m) => (
        <Text key={m.name} style={s.legendLine}>
          <Text style={s.legendName}>{m.label}</Text>
          {`: ${m.text}`}
        </Text>
      ))}
    </View>
  );
}

// Why a tap did nothing: a link that cannot open (the reason comes from the model), as a plain danger row.
export function Blocked({ text }) {
  if (!text) return null;
  return (
    <View style={s.blocked} accessibilityRole="alert">
      <IconAlert size={16} strokeWidth={2} color={color.danger} />
      <Text style={s.blockedText}>{`Cannot open: ${text}`}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  note: { ...type.caption, color: color.t3 },
  body: { ...type.body, color: color.t1 },
  section: { marginTop: space.xl },
  sectionBody: { marginTop: space.xs, gap: space.xs },
  infoRow: { paddingVertical: space.s, gap: 2, borderTopWidth: HAIRLINE, borderColor: color.hair },
  linkRow: {
    minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s,
    borderTopWidth: HAIRLINE, borderColor: color.hair,
  },
  rowLine: { borderTopWidth: HAIRLINE, borderColor: color.hair },
  expRow: { minHeight: size.caseRow, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  valueRow: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  rowGrow: { flex: 1 },
  // The circle (8 dp) and the triangle (10 dp) sit in one box, so every title starts at the same x.
  expKey: { width: 12, alignItems: 'center' },
  expBar: { width: 56 },
  expValue: { ...type.rowId, width: 48, textAlign: 'right', color: color.t1, letterSpacing: 0 },
  mutedText: { ...type.secondary, color: color.t3 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.body, fontWeight: '500', color: color.t1, fontVariant: font.numeric },
  rowTitleOff: { color: color.t2 },
  state: { ...type.secondary },
  detail: { ...type.secondary, color: color.t2 },
  legend: { gap: space.m },
  legendLine: { ...type.secondary, lineHeight: 18, color: color.t2 },
  legendOn: { color: color.t1 },
  legendName: { fontWeight: '600' },
  blocked: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.l },
  blockedText: { ...type.secondary, flex: 1, color: color.danger },
});

// SCR-07 strip chart: one column per experiment, one marker per evaluated case (UNet circle, DINOv2 triangle), a
// ring on the server's outliers.
// stripLayout and pointAt (view.mjs) do the geometry. A tap only selects a dot; opening the case needs the link.

export const STRIP_HEIGHT = 240;

export function StripChart({ columns, selected, onSelect, label }) {
  const [width, setWidth] = useState(0);
  const layout = useMemo(
    () => (width > 0 ? stripLayout(columns, { width, height: STRIP_HEIGHT, padding: 40 }) : null),
    [columns, width],
  );

  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      accessibilityLabel={label}
      testID="strip-chart"
    >
      {layout ? (
        <Pressable onPress={(e) => onSelect(pointAt(layout, e.nativeEvent.locationX, e.nativeEvent.locationY))}>
          <Svg width={layout.width} height={layout.height}>
            {layout.axis.ticks.map((t) => (
              <G key={`tick-${t.value}`}>
                <SvgLine x1={layout.plot.x0} x2={layout.plot.x1} y1={t.y} y2={t.y} stroke={color.hair} strokeWidth={1} />
                <SvgText x={layout.plot.x0 - 6} y={t.y + 4} fill={color.t3} fontSize={11} textAnchor="end">
                  {t.value.toFixed(1)}
                </SvgText>
              </G>
            ))}
            {layout.columns.map((col) => (
              <G key={col.key}>
                <SvgLine x1={col.x1} x2={col.x1} y1={layout.plot.y0} y2={layout.plot.y1} stroke={color.hair} strokeWidth={0.5} />
                <SvgText x={col.xCenter} y={layout.plot.y1 + 14} fill={color.t3} fontSize={11} textAnchor="middle">
                  {col.label}
                </SvgText>
                {col.points.map((p, i) => (
                  <Marker key={`${col.key}-${i}`} group={col.group} x={p.x} y={p.y} r={p.r} ring={p.outlier} />
                ))}
              </G>
            ))}
            {layout.groups.map((g) => (
              <SvgText
                key={`group-${g.group}`}
                x={(g.x0 + g.x1) / 2}
                y={layout.plot.y1 + 30}
                fill={color.t1}
                fontSize={11}
                fontWeight="bold"
                textAnchor="middle"
              >
                {FAMILY_LABEL[g.group] || g.group}
              </SvgText>
            ))}
            {selected ? (
              <Circle cx={selected.x} cy={selected.y} r={selected.r + 5} fill="none" stroke={color.t1} strokeWidth={2} />
            ) : null}
          </Svg>
        </Pressable>
      ) : (
        <View style={{ height: STRIP_HEIGHT }} />
      )}
      <FamilyLegend />
    </View>
  );
}

// Keeps a model's snapshot (models.mjs) in React state. The LOADING snapshot shows as soon as a request starts, so
// old numbers never stay on screen as if current. Only the latest request may update the screen, and a model that
// throws becomes a FATAL_INVALID state instead of an unhandled promise rejection.

function failed(err) {
  return Object.freeze({
    view: fatalInvalid({
      code: 'SCREEN_ERROR',
      safeMessage: 'The screen could not load its data.',
      detail: { problems: [String(err && err.message)] },
    }, [RECOVERY.BACK]),
  });
}

export function useSnapshot(model) {
  const [snap, setSnap] = useState(() => model.current);
  const alive = useRef(true);
  const latest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback((start) => {
    latest.current += 1;
    const mine = latest.current;
    let pending;
    try {
      pending = start();
    } catch (err) {
      setSnap(failed(err));
      return;
    }
    setSnap(model.current);
    Promise.resolve(pending).then(
      (next) => { if (alive.current && mine === latest.current) setSnap(next); },
      (err) => { if (alive.current && mine === latest.current) setSnap(failed(err)); },
    );
  }, [model]);

  return [snap, run, setSnap];
}
