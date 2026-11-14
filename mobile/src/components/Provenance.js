/*
 * A folded card for the identifiers behind what is on screen (artifact ids, checksums, versions). Closed by
 * default, so the screen reads as a viewer first; one tap shows every id, selectable for a bug report.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { color, font, MIN_TOUCH, radius, space } from './theme';

export default function Provenance({ title = 'Provenance', summary = null, children, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={s.card}>
      <TouchableOpacity
        style={s.head}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? 'shown' : 'hidden'}`}
      >
        <Text style={s.title}>{open ? '▾' : '▸'} {title}</Text>
        {!open && summary ? <Text style={s.summary} numberOfLines={1}>{summary}</Text> : null}
      </TouchableOpacity>
      {open ? <View style={s.body}>{children}</View> : null}
    </View>
  );
}

// One identifier line inside the card.
export function IdLine({ children }) {
  return <Text style={s.id} selectable>{children}</Text>;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.l,
    paddingHorizontal: space.m,
  },
  head: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  title: { color: color.textDim, fontSize: font.small, fontWeight: '700', letterSpacing: 0.5 },
  summary: { color: color.textFaint, fontSize: font.tiny, marginTop: 2 },
  body: { paddingBottom: space.m, gap: space.xs },
  id: { color: color.textDim, fontFamily: font.mono, fontSize: font.tiny },
});
