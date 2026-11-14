/*
 * The metric strip of the study overview: up to three cells split by 1 dp vertical hairlines, each a label, a large
 * number and a caption ("Cases > / 74 / in this study"). A cell with onPress shows a chevron after its label and
 * opens what it counts. A value that does not exist is a word or "—", never 0.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconChevronRight } from './icons';
import { color, HAIRLINE, type } from './theme';

// cells: [{ label, value, caption, onPress?, testID? }]
export default function MetricStrip({ cells, style }) {
  return (
    <View style={[s.strip, style]}>
      {cells.map((c, i) => {
        const body = (
          <>
            <View style={s.label}>
              <Text style={s.labelT}>{c.label}</Text>
              {c.onPress ? <IconChevronRight size={14} strokeWidth={2} color={color.t3} /> : null}
            </View>
            <Text style={s.value}>{c.value}</Text>
            {c.caption ? <Text style={s.caption}>{c.caption}</Text> : null}
          </>
        );
        const cellStyle = [s.cell, i === 0 && s.first];
        return c.onPress ? (
          <TouchableOpacity
            key={c.label}
            style={cellStyle}
            onPress={c.onPress}
            accessibilityRole="button"
            accessibilityLabel={[c.label, c.value, c.caption].filter(Boolean).join(' ')}
            testID={c.testID}
          >
            {body}
          </TouchableOpacity>
        ) : (
          <View key={c.label} style={cellStyle} testID={c.testID}>{body}</View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  strip: { flexDirection: 'row', borderBottomWidth: HAIRLINE, borderColor: color.hair },
  cell: { flex: 1, paddingTop: 8, paddingBottom: 16, paddingLeft: 16, borderLeftWidth: HAIRLINE, borderColor: color.hair },
  first: { paddingLeft: 0, borderLeftWidth: 0 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  labelT: { ...type.caption, fontWeight: '500', color: color.t2 },
  value: { ...type.metric, color: color.t1, marginTop: 4 },
  caption: { ...type.caption, color: color.t3 },
});
