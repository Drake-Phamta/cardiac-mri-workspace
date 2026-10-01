/*
 * SCR-07 distribution: one strip per experiment of the `08` section 2
 * matrix, one dot per successfully evaluated case, drawn with
 * react-native-svg.
 *
 * Geometry and hit-testing are app/verticals/v3_study_and_compare/strip.mjs
 * (stripLayout, pointAt) - pure and tested in node. This file only draws
 * what they computed. A strip and not a box, because Tukey whiskers would be
 * a second definition of "outlier" next to DR-010; the server's DR-010 cases
 * get a ring, and are also listed as text under the chart (never colour
 * alone).
 *
 * A tap selects the nearest dot within reach; the screen then shows the case
 * and an "Open case" link, so a dense strip cannot navigate by accident.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { pointAt, stripLayout } from '../../../../app/verticals/v3_study_and_compare/index.mjs';
import { color } from '../../ui/theme';
import { FAMILY_LABEL } from './v3View.mjs';

export const STRIP_HEIGHT = 240;

const FAMILY_COLOR = Object.freeze({ UNET: color.accent, DINOV2: color.inference });

export default function StripChart({ columns, selected, onSelect, label }) {
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
                <Line x1={layout.plot.x0} x2={layout.plot.x1} y1={t.y} y2={t.y} stroke={color.border} strokeWidth={1} />
                <SvgText x={layout.plot.x0 - 6} y={t.y + 4} fill={color.textDim} fontSize={10} textAnchor="end">
                  {t.value.toFixed(1)}
                </SvgText>
              </G>
            ))}
            {layout.columns.map((col) => (
              <G key={col.key}>
                <Line x1={col.x1} x2={col.x1} y1={layout.plot.y0} y2={layout.plot.y1} stroke={color.border} strokeWidth={0.5} />
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
