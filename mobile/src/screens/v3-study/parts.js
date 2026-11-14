// Small UI pieces shared by SCR-01 and SCR-07. No data logic: every string they draw comes from the .mjs files.
// Status is always words next to its colour, never colour alone, and every tap target is at least MIN_TOUCH.

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { TONE } from '../../components/stateCopy.mjs';
import { color, font, MIN_TOUCH, radius, space } from '../../components/theme';
import Svg, { Circle, G, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { pointAt, stripLayout, FAMILY_LABEL } from './view.mjs';
import { FamilyLegend, Marker } from './charts';
import { LOCKED_METRICS, METRIC_LEGEND } from './about.mjs';
import { fatalInvalid, RECOVERY } from '../../api/states.mjs';

export const TONE_COLOR = Object.freeze({
  [TONE.NEUTRAL]: color.textDim,
  [TONE.INFO]: color.info,
  [TONE.WARN]: color.warn,
  [TONE.DANGER]: color.danger,
});

export function Card({ title, children, testID }) {
  return (
    <View style={s.card} testID={testID}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Line({ children, dim = false, mono = false, tone = null, small = false }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <Text
      style={[s.line, dim && s.dim, mono && s.mono, small && s.small, tone && { color: TONE_COLOR[tone] || color.text }]}
      selectable
    >
      {children}
    </Text>
  );
}

// A link that cannot open keeps its label and shows the reason, so a tap never silently does nothing.
export function LinkButton({ label, route, onGo, testID }) {
  const ok = Boolean(route && route.ok);
  return (
    <View style={s.linkBox}>
      <TouchableOpacity
        style={[s.btn, !ok && s.btnOff]}
        onPress={() => onGo(route)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !ok }}
        testID={testID}
      >
        <Text style={[s.btnT, !ok && s.btnOffT]}>{label}</Text>
      </TouchableOpacity>
      {!ok && route && route.reason ? <Text style={s.reason}>{route.reason}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, selected && s.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
    >
      <Text style={[s.chipT, selected && s.chipOnT]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Row({ children }) {
  return <View style={s.row}>{children}</View>;
}

// A button that does something on this screen (a LinkButton goes to another screen).
export function Button({ label, onPress }) {
  return (
    <View style={s.linkBox}>
      <TouchableOpacity style={s.btn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={s.btnT}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// What each metric means (about.mjs), the picked one in bold; metrics in mm or mL are listed as locked.
export function MetricLegend({ selected = null }) {
  return (
    <View style={s.legend} testID="metric-legend">
      {METRIC_LEGEND.map((m) => (
        <Text key={m.name} style={[s.legendLine, m.name === selected && s.legendOn]}>
          <Text style={s.legendName}>{m.label}</Text>
          {` (${m.name}): ${m.text}`}
        </Text>
      ))}
      {LOCKED_METRICS.map((m) => (
        <Text key={m.name} style={[s.legendLine, s.legendLocked]}>
          <Text style={s.legendName}>{m.label}</Text>
          {`: ${m.text}`}
        </Text>
      ))}
    </View>
  );
}

// A label that is not a button, such as the server's verdict next to a number.
export function Pill({ label, ok = false }) {
  return (
    <View style={[s.pill, ok ? s.pillOk : s.pillOff]}>
      <Text style={[s.pillT, { color: ok ? color.ok : color.textDim }]}>{label}</Text>
    </View>
  );
}

// A summary tile on SCR-01: a title, one large number (or why there is none) and a few small lines.
export function Tile({ title, value, text, lines = [], children, testID }) {
  return (
    <View style={s.tile} testID={testID}>
      <Text style={s.tileTitle}>{title}</Text>
      {value !== null && value !== undefined ? <Text style={s.tileValue}>{value}</Text> : null}
      {text ? <Text style={s.tileText}>{text}</Text> : null}
      {lines.map((l) => <Text key={l} style={s.tileText}>{l}</Text>)}
      {children}
    </View>
  );
}

// One of the server's lowest-Dice cases: a tappable row with its value and a small bar as long as the Dice (0 to 1).
export function OutlierBar({ row, barColor, onGo }) {
  const ok = Boolean(row.route && row.route.ok);
  return (
    <View style={s.linkBox}>
      <TouchableOpacity
        style={[s.barRow, !ok && s.btnOff]}
        onPress={() => onGo(row.route)}
        accessibilityRole="button"
        accessibilityLabel={`${row.caseId}, ${row.valueText}`}
        accessibilityState={{ disabled: !ok }}
      >
        <View style={s.barHead}>
          <Text style={[s.barCase, !ok && s.btnOffT]}>{row.caseId}</Text>
          <Text style={s.barValue}>{row.valueText}</Text>
        </View>
        {row.bar !== null ? (
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${Math.round(row.bar * 100)}%`, backgroundColor: barColor || color.accent }]} />
          </View>
        ) : null}
      </TouchableOpacity>
      {!ok && row.route && row.route.reason ? <Text style={s.reason}>{row.route.reason}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 10,
    padding: space.l, gap: space.xs,
  },
  cardTitle: { color: color.text, fontSize: font.h2, fontWeight: '700', marginBottom: space.xs },
  line: { color: color.text, fontSize: font.body, lineHeight: 20 },
  dim: { color: color.textDim },
  mono: { fontFamily: font.mono, fontSize: font.small },
  small: { fontSize: font.small, lineHeight: 16 },
  linkBox: { marginTop: space.s },
  btn: {
    minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.l, borderRadius: 8, borderWidth: 1,
    borderColor: color.accent, backgroundColor: color.accentBg,
  },
  btnOff: { borderColor: color.border, backgroundColor: color.surfaceHi },
  btnT: { color: color.accent, fontSize: font.body, fontWeight: '600' },
  btnOffT: { color: color.textFaint },
  reason: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  chip: {
    minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.m, borderRadius: 24, borderWidth: 1,
    borderColor: color.border, backgroundColor: color.surfaceHi,
  },
  chipOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  chipT: { color: color.textDim, fontSize: font.body },
  chipOnT: { color: color.accent, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.xs },
  legend: { marginTop: space.s, gap: 2 },
  legendLine: { color: color.textDim, fontSize: font.small, lineHeight: 17 },
  legendOn: { color: color.text },
  legendLocked: { color: color.textFaint },
  legendName: { fontWeight: '700' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  pillOk: { borderColor: color.ok, backgroundColor: color.okBg },
  pillOff: { borderColor: color.control, backgroundColor: color.surfaceHi },
  pillT: { fontSize: font.tiny, fontWeight: '700' },
  tile: {
    flexGrow: 1, flexBasis: 140, backgroundColor: color.surface, borderColor: color.border, borderWidth: 1,
    borderRadius: radius.l, padding: space.m, gap: 2,
  },
  tileTitle: { color: color.textDim, fontSize: font.small, fontWeight: '700' },
  tileValue: { color: color.text, fontSize: 28, fontWeight: '700', fontVariant: font.numeric },
  tileText: { color: color.textDim, fontSize: font.small },
  barRow: {
    minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.m, paddingVertical: space.xs, borderRadius: radius.m,
    borderWidth: 1, borderColor: color.control, backgroundColor: color.surfaceHi, gap: space.xs,
  },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barCase: { color: color.text, fontFamily: font.mono, fontSize: font.small, fontWeight: '600' },
  barValue: { color: color.textDim, fontSize: font.small, fontVariant: font.numeric },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: color.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
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
                <SvgLine x1={layout.plot.x0} x2={layout.plot.x1} y1={t.y} y2={t.y} stroke={color.border} strokeWidth={1} />
                <SvgText x={layout.plot.x0 - 6} y={t.y + 4} fill={color.textDim} fontSize={10} textAnchor="end">
                  {t.value.toFixed(1)}
                </SvgText>
              </G>
            ))}
            {layout.columns.map((col) => (
              <G key={col.key}>
                <SvgLine x1={col.x1} x2={col.x1} y1={layout.plot.y0} y2={layout.plot.y1} stroke={color.border} strokeWidth={0.5} />
                <SvgText x={col.xCenter} y={layout.plot.y1 + 14} fill={color.textDim} fontSize={10} textAnchor="middle">
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
                fill={color.text}
                fontSize={11}
                fontWeight="bold"
                textAnchor="middle"
              >
                {FAMILY_LABEL[g.group] || g.group}
              </SvgText>
            ))}
            {selected ? (
              <Circle cx={selected.x} cy={selected.y} r={selected.r + 5} fill="none" stroke={color.text} strokeWidth={2} />
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
