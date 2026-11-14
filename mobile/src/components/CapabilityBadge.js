/*
 * The case mode tag, on the case list rows and the case screen header, so a case reads the same in both.
 * The mode is a word on a neutral tag: Direction A keeps colour for data and state, so the two modes get none.
 * A mode that disagrees with the case's data is the one coloured case (warn), and says so in words.
 */

import React from 'react';
import { View } from 'react-native';

import { Tag } from './Controls';

export default function CapabilityBadge({ capability, compact = false }) {
  const warn = !capability.consistent;
  const label = `${compact ? capability.short : capability.label}${warn ? ' · inconsistent' : ''}`;
  return (
    <View accessibilityLabel={`mode ${capability.label}`}>
      <Tag label={label} tone={warn ? 'warn' : 'neutral'} />
    </View>
  );
}
