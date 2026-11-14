// Chart pieces of SCR-07: the family marker and its legend. Geometry comes from the .mjs files; these only draw.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Path } from 'react-native-svg';

import { color, font, space } from '../../components/theme';
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

const s = StyleSheet.create({
  legend: { flexDirection: 'row', gap: space.l, marginTop: space.xs },
  item: { color: color.text, fontSize: font.small },
});
