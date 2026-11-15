// One line that says what the last action did or why a control is off: a check for "done", an info mark for a note, an
// alert for "refused". Words come from the controllers (reviewScreen.mjs, findings.mjs); this only draws them. Used by
// SCR-06 and SCR-08. A notice with no words draws nothing, never an empty box.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconAlert, IconCheck, IconInfo } from '../../components/icons';
import { color, space, type } from '../../components/theme';

export default function Notice({ notice, style, testID = 'notice' }) {
  if (!notice || !notice.text) return null;
  const refused = notice.kind === 'refused';
  const Icon = refused ? IconAlert : notice.kind === 'info' ? IconInfo : IconCheck;
  return (
    <View style={[s.row, style]} accessibilityRole={refused ? 'alert' : undefined}>
      <Icon size={16} strokeWidth={2} color={refused ? color.warn : notice.kind === 'info' ? color.t2 : color.live} />
      <Text style={[s.text, refused && s.refused]} testID={testID}>{notice.text}</Text>
    </View>
  );
}

// The text shrinks (flexShrink), it does not grow (flex: 1): a message inside a box that is only as wide as its content
// (the one over the picture) would otherwise collapse to nothing and leave the icon alone in an empty box.
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  text: { ...type.secondary, lineHeight: 18, color: color.t1, flexShrink: 1 },
  refused: { color: color.warn },
});
