/*
 * The mode capability badge - the SAME component on SCR-02 rows and the
 * SCR-03 header, fed by the same capabilityOf(), so a case reads identically
 * in both places (TC-CASE-002). The label is text, not only colour (`10` §9).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, space } from '../../ui/theme';

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
