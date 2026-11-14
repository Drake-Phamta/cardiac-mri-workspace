// Small UI pieces shared by SCR-01 and SCR-07. No data logic: every string they draw comes from view.mjs.
// Status is always words next to its colour, never colour alone, and every tap target is at least MIN_TOUCH.

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { TONE } from '../../components/stateCopy.mjs';
import { color, font, MIN_TOUCH, space } from '../../components/theme';
import Svg, { Circle, G, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { pointAt, stripLayout, FAMILY_LABEL } from './view.mjs';
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
});

// SCR-07 strip chart: one column per experiment, one dot per evaluated case, a ring on the server's outliers.
// stripLayout and pointAt (view.mjs) do the geometry. A tap only selects a dot; opening the case needs the link.

export const STRIP_HEIGHT = 240;

const FAMILY_COLOR = Object.freeze({ UNET: color.accent, DINOV2: color.inference });

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
                  <Circle
                    key={`${col.key}-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill={FAMILY_COLOR[col.group] || color.text}
                    fillOpacity={0.75}
                    stroke={p.outlier ? color.warn : 'none'}
                    strokeWidth={p.outlier ? 2 : 0}
                  />
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
