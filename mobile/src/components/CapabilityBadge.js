/*
 * The case mode badge, on the case list rows and the case screen header, so a case reads the same in both.
 * The mode is written as text, not shown by colour alone.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, space } from './theme';

const TONE = {
  EVALUATION: { fg: color.evaluation, bg: color.okBg },
  INFERENCE_REVIEW: { fg: color.inference, bg: '#221a2e' },
  UNKNOWN: { fg: color.warn, bg: color.warnBg },
};

export default function CapabilityBadge({ capability, compact = false }) {
  const tone = TONE[capability.key] || TONE.UNKNOWN;
  return (
    <View style={[s.badge, { borderColor: tone.fg, backgroundColor: tone.bg }]} accessibilityLabel={`mode ${capability.label}`}>
      <Text style={[s.label, { color: tone.fg }]}>{compact ? capability.short : capability.label}</Text>
      {!capability.consistent && <Text style={[s.label, { color: color.warn }]}> · inconsistent</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6,
    paddingHorizontal: space.s, paddingVertical: 2,
  },
  label: { fontSize: font.small, fontWeight: '700', fontFamily: font.mono },
});
