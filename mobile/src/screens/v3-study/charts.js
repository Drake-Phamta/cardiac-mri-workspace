// Chart pieces of SCR-07: the family marker and its legend, the paired-difference chart and the trend chart.
// Geometry comes from the .mjs files; these only draw.

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line as SvgLine, Path, Rect, Text as SvgText } from 'react-native-svg';

import { color, font, space } from '../../components/theme';
import { pairAt, pairedLayout } from './paired.mjs';
import { trendLayout } from './trend.mjs';
import { FAMILY_LABEL, FAMILY_STYLE, trianglePath } from './view.mjs';

// One case of one family: a circle for UNet, a triangle for DINOv2. `ring` outlines it (the server's outliers).
export function Marker({ group, x, y, r, ring = false }) {
  const style = FAMILY_STYLE[group];
  const paint = {
    fill: style ? style.color : color.text,
    fillOpacity: 0.8,
    stroke: ring ? color.warn : 'none',
    strokeWidth: ring ? 2 : 0,
  };
  if (style && style.marker === 'triangle') return <Path d={trianglePath(x, y, r)} {...paint} />;
  return <Circle cx={x} cy={y} r={r} {...paint} />;
}

export function FamilyLegend() {
  return (
    <View style={s.legend}>
      {Object.keys(FAMILY_STYLE).map((group) => (
        <Text key={group} style={s.item}>
          <Text style={{ color: FAMILY_STYLE[group].color }}>{FAMILY_STYLE[group].marker === 'triangle' ? '▲' : '●'}</Text>
          {` ${FAMILY_LABEL[group]}`}
        </Text>
      ))}
    </View>
  );
}

export const PAIRED_HEIGHT = 200;

// Paired differences of one comparison (paired.mjs): a dashed zero line, the median as a solid line, one dot per
// case, lowest difference on the left. A tap selects a dot; the card under it offers to open the case.
export function PairedChart({ card, selected, onSelect }) {
  const [width, setWidth] = useState(0);
  const layout = useMemo(
    () => (width > 0 ? pairedLayout(card.pairs, card.median, { width, height: PAIRED_HEIGHT }) : null),
    [card, width],
  );
  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      accessibilityLabel={card.summaryText}
      testID={`paired-${card.id}`}
    >
      {layout ? (
        <Pressable onPress={(e) => onSelect(pairAt(layout, e.nativeEvent.locationX, e.nativeEvent.locationY))}>
          <Svg width={layout.width} height={layout.height}>
            {layout.ticks.map((t) => (
              <G key={`tick-${t.value}`}>
                <SvgLine x1={layout.plot.x0} x2={layout.plot.x1} y1={t.y} y2={t.y} stroke={color.border} strokeWidth={1} />
                <SvgText x={layout.plot.x0 - 6} y={t.y + 4} fill={color.textDim} fontSize={10} textAnchor="end">
                  {`${t.value > 0 ? '+' : ''}${t.value.toFixed(2)}`}
                </SvgText>
              </G>
            ))}
            <SvgLine
              x1={layout.plot.x0} x2={layout.plot.x1} y1={layout.zeroY} y2={layout.zeroY}
              stroke={color.textDim} strokeWidth={1} strokeDasharray="4 4"
            />
            <SvgLine
              x1={layout.plot.x0} x2={layout.plot.x1} y1={layout.medianY} y2={layout.medianY}
              stroke={color.accent} strokeWidth={2}
            />
            {layout.points.map((p) => <Circle key={p.caseId} cx={p.x} cy={p.y} r={p.r} fill={color.text} fillOpacity={0.85} />)}
            {selected ? (
              <Circle cx={selected.x} cy={selected.y} r={selected.r + 5} fill="none" stroke={color.accent} strokeWidth={2} />
            ) : null}
          </Svg>
        </Pressable>
      ) : (
        <View style={{ height: PAIRED_HEIGHT }} />
      )}
      <Text style={s.item}>
        <Text style={{ color: color.accent }}>━</Text>
        {' median difference   '}
        <Text style={{ color: color.textDim }}>┄</Text>
        {' no difference (0)'}
      </Text>
    </View>
  );
}

export const TREND_HEIGHT = 220;

// Trend over 25 / 50 / 100 % (trend.mjs). Per run: every case as a small marker, the q1-q3 bar and the median
// tick. Where the server judged a family's runs comparable, a band and a line join them; DINOv2's line is dashed
// so the two lines differ without colour.
export function TrendChart({ series, label }) {
  const [width, setWidth] = useState(0);
  const layout = useMemo(
    () => (width > 0 ? trendLayout(series, { width, height: TREND_HEIGHT }) : null),
    [series, width],
  );
  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} accessibilityLabel={label} testID="trend-chart">
      {layout ? (
        <Svg width={layout.width} height={layout.height}>
          {layout.ticks.map((t) => (
            <G key={`tick-${t.value}`}>
              <SvgLine x1={layout.plot.x0} x2={layout.plot.x1} y1={t.y} y2={t.y} stroke={color.border} strokeWidth={1} />
              <SvgText x={layout.plot.x0 - 6} y={t.y + 4} fill={color.textDim} fontSize={10} textAnchor="end">
                {t.value.toFixed(2)}
              </SvgText>
            </G>
          ))}
          {layout.labels.map((l) => (
            <SvgText key={l.text} x={l.x} y={layout.plot.y1 + 16} fill={color.textDim} fontSize={11} textAnchor="middle">
              {l.text}
            </SvgText>
          ))}
          {layout.families.map((f) => {
            const paint = FAMILY_STYLE[f.family] ? FAMILY_STYLE[f.family].color : color.text;
            const dashed = FAMILY_STYLE[f.family] && FAMILY_STYLE[f.family].marker === 'triangle';
            return (
              <G key={f.family}>
                {f.band ? <Path d={f.band} fill={paint} fillOpacity={0.12} /> : null}
                {f.line ? (
                  <Path d={f.line} fill="none" stroke={paint} strokeWidth={2} strokeDasharray={dashed ? '6 4' : undefined} />
                ) : null}
                {f.runs.map((run) => (
                  <G key={run.experimentId}>
                    {run.iqr ? <Rect x={run.x - 5} y={run.iqr.y} width={10} height={run.iqr.height} fill={paint} fillOpacity={0.3} /> : null}
                    {run.dots.map((d, i) => (
                      <Marker key={`${run.experimentId}-${i}`} group={f.family} x={d.x} y={d.y} r={d.r} />
                    ))}
                    {run.medianY !== null ? (
                      <SvgLine x1={run.x - 9} x2={run.x + 9} y1={run.medianY} y2={run.medianY} stroke={paint} strokeWidth={3} />
                    ) : null}
                  </G>
                ))}
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: TREND_HEIGHT }} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: 'row', gap: space.l, marginTop: space.xs },
  item: { color: color.text, fontSize: font.small, marginTop: space.xs },
});
