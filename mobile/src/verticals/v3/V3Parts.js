/*
 * Small presentational pieces shared by SCR-01 and SCR-07. No data logic -
 * every string they draw comes from v3View.mjs.
 *
 * Status is always printed as words next to its colour (`10` section 9:
 * never colour alone), and every tappable element is at least MIN_TOUCH.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { TONE } from '../../ui/stateCopy.mjs';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';

export const TONE_COLOR = Object.freeze({
  [TONE.NEUTRAL]: color.textDim,
  [TONE.INFO]: color.info,
  [TONE.WARN]: color.warn,
  [TONE.DANGER]: color.danger,
});

export function Card({ title, children, testID }) {
  return (
    <View style={s.card} testID={testID}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Line({ children, dim = false, mono = false, tone = null, small = false }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <Text
      style={[s.line, dim && s.dim, mono && s.mono, small && s.small, tone && { color: TONE_COLOR[tone] || color.text }]}
      selectable
    >
      {children}
    </Text>
  );
}

/*
 * A link that either opens its route or says why it cannot. A disabled link
 * keeps its label and shows the reason - it never silently does nothing.
 */
export function LinkButton({ label, route, onGo, testID }) {
  const ok = Boolean(route && route.ok);
  return (
    <View style={s.linkBox}>
      <TouchableOpacity
        style={[s.btn, !ok && s.btnOff]}
        onPress={() => onGo(route)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !ok }}
        testID={testID}
      >
        <Text style={[s.btnT, !ok && s.btnOffT]}>{label}</Text>
      </TouchableOpacity>
      {!ok && route && route.reason ? <Text style={s.reason}>{route.reason}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, selected && s.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
    >
      <Text style={[s.chipT, selected && s.chipOnT]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Row({ children }) {
  return <View style={s.row}>{children}</View>;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 10,
    padding: space.l, gap: space.xs,
  },
  cardTitle: { color: color.text, fontSize: font.h2, fontWeight: '700', marginBottom: space.xs },
  line: { color: color.text, fontSize: font.body, lineHeight: 20 },
  dim: { color: color.textDim },
  mono: { fontFamily: font.mono, fontSize: font.small },
  small: { fontSize: font.small, lineHeight: 16 },
  linkBox: { marginTop: space.s },
  btn: {
    minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.l, borderRadius: 8, borderWidth: 1,
    borderColor: color.accent, backgroundColor: color.accentBg,
  },
  btnOff: { borderColor: color.border, backgroundColor: color.surfaceHi },
  btnT: { color: color.accent, fontSize: font.body, fontWeight: '600' },
  btnOffT: { color: color.textFaint },
  reason: { color: color.textDim, fontSize: font.small, marginTop: 2 },
  chip: {
    minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.m, borderRadius: 24, borderWidth: 1,
    borderColor: color.border, backgroundColor: color.surfaceHi,
  },
  chipOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  chipT: { color: color.textDim, fontSize: font.body },
  chipOnT: { color: color.accent, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.xs },
});
