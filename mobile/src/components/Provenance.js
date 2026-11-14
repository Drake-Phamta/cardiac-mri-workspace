/*
 * A folded row for the identifiers behind what is on screen (artifact ids, checksums, versions). Closed by
 * default, so the screen reads as a viewer first; one tap shows every id, selectable for a bug report.
 * Direction A: a 48 dp row between hairlines with a chevron, no card.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconChevronDown, IconChevronRight } from './icons';
import { color, HAIRLINE, MIN_TOUCH, space, type } from './theme';

export default function Provenance({ title = 'Provenance', summary = null, children, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  const Chevron = open ? IconChevronDown : IconChevronRight;
  return (
    <View style={s.box}>
      <TouchableOpacity
        style={s.head}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? 'shown' : 'hidden'}`}
      >
        <Chevron size={16} strokeWidth={2} color={color.t3} />
        <View style={s.headText}>
          <Text style={s.title}>{title}</Text>
          {!open && summary ? <Text style={s.summary} numberOfLines={1}>{summary}</Text> : null}
        </View>
      </TouchableOpacity>
      {open ? <View style={s.body}>{children}</View> : null}
    </View>
  );
}

// One identifier line inside the row.
export function IdLine({ children }) {
  return <Text style={s.id} selectable>{children}</Text>;
}

const s = StyleSheet.create({
  box: { borderTopWidth: HAIRLINE, borderBottomWidth: HAIRLINE, borderColor: color.hair },
  head: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.xs },
  headText: { flex: 1 },
  title: { ...type.body, fontWeight: '500', color: color.t1 },
  summary: { ...type.caption, color: color.t3 },
  body: { paddingLeft: 24, paddingBottom: space.m, gap: space.xs },
  id: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
});
