/*
 * The case mode tag, on the case list rows and the case screen header, so a case reads the same in both.
 * The mode is a word on a neutral tag: Direction A keeps colour for data and state, so the two modes get none.
 * A mode that disagrees with the case's data is the one coloured case (warn), and says so in words.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from './theme';

export default function CapabilityBadge({ capability, compact = false }) {
  const warn = !capability.consistent;
  return (
    <View style={[s.tag, warn && s.warnTag]} accessibilityLabel={`mode ${capability.label}`}>
      <Text style={[s.label, warn && s.warnLabel]}>
        {compact ? capability.short : capability.label}
        {warn ? ' · inconsistent' : ''}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start', height: 20, justifyContent: 'center', paddingHorizontal: 6,
    borderRadius: radius.xs, backgroundColor: color.raised,
  },
  warnTag: { backgroundColor: color.warnSoft },
  label: { ...type.micro, fontWeight: '600', color: color.t2 },
  warnLabel: { color: color.warn },
});
