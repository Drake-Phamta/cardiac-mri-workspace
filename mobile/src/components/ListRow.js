/*
 * Lists in Direction A: hairlines instead of cards. A section label (an uppercase overline), and rows in the three
 * shapes of the mockups:
 *   nav    48 dp: optional 20 dp icon, a label and a chevron ("About this data").
 *   meter  40 dp: an id, a bar that fills the row, the value and a chevron (Lowest Dice on the overview).
 *   case   52 dp: an id with an optional tag, a 56 dp bar, the value; or a word in `trailing` ("No GT").
 * A missing value is a word, never 0 and never an empty bar: pass bar={null} and say why in `trailing`.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconChevronRight } from './icons';
import { color, HAIRLINE, size, type } from './theme';

/*
 * variant 'section' sits inside the page margin, with an optional caption on the right ("0 of 3 comparable").
 * 'column' (24 dp, "CASE ... DICE") and 'group' (36 dp, "No Dice for this experiment") span the screen width,
 * pad themselves 16 dp and draw a hairline under them.
 */
export function SectionLabel({ title, meta = null, variant = 'section', style }) {
  if (variant === 'column') {
    return (
      <View style={[s.column, style]}>
        <Text style={s.overline}>{title}</Text>
        {meta ? <Text style={s.overline}>{meta}</Text> : null}
      </View>
    );
  }
  return (
    <View style={[variant === 'group' ? s.group : s.section, style]}>
      <Text style={s.overline} accessibilityRole="header">{title}</Text>
      {meta && variant === 'section' ? <Text style={s.meta}>{meta}</Text> : null}
    </View>
  );
}

// A 4 dp bar for a value from 0 to 1: warn for an outlier, neutral grey otherwise. null draws nothing.
export function MiniBar({ value, tone = 'neutral', style }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const pct = `${Math.round(Math.max(0, Math.min(1, value)) * 1000) / 10}%`;
  const fill = tone === 'warn' ? color.warn : tone === 'accent' ? color.accent : color.barNeutral;
  return (
    <View style={[s.bar, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[s.barFill, { width: pct, backgroundColor: fill }]} />
    </View>
  );
}

const SHAPE = {
  nav: { height: size.row, gap: 16, chevron: 20 },
  meter: { height: size.meterRow, gap: 16, chevron: 16 },
  case: { height: size.caseRow, gap: 8, chevron: 16 },
};

export default function ListRow({
  variant = 'nav', title, icon: Icon = null, tag = null, bar, barTone = 'neutral', value = null, trailing = null,
  onPress = null, chevron = variant !== 'case' && Boolean(onPress), divider = 'bottom', accessibilityLabel, testID,
}) {
  const shape = SHAPE[variant] || SHAPE.nav;
  const isId = variant !== 'nav';
  const body = (
    <>
      {Icon ? <Icon size={size.iconSmall} color={color.t2} /> : null}
      <View style={[s.titleBox, variant === 'meter' && s.meterTitle]}>
        <Text style={[s.title, isId && s.id, variant === 'meter' && s.meterId]} numberOfLines={1}>{title}</Text>
        {tag}
      </View>
      {variant !== 'meter' ? <View style={s.spacer} /> : null}
      {bar !== undefined ? <MiniBar value={bar} tone={barTone} style={variant === 'meter' ? s.barFlex : s.barFixed} /> : null}
      {trailing}
      {value !== null && !trailing ? (
        <Text style={[s.value, variant === 'case' ? s.valueCase : s.valueMeter]}>{value}</Text>
      ) : null}
      {chevron ? <IconChevronRight size={shape.chevron} color={color.t3} /> : null}
    </>
  );
  const style = [s.row, { height: shape.height, gap: shape.gap }, DIVIDER[divider]];
  if (!onPress) return <View style={style} testID={testID} accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <TouchableOpacity
      style={style}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {body}
    </TouchableOpacity>
  );
}

const line = { borderColor: color.hair };
const DIVIDER = {
  top: { ...line, borderTopWidth: HAIRLINE },
  bottom: { ...line, borderBottomWidth: HAIRLINE },
  both: { ...line, borderTopWidth: HAIRLINE, borderBottomWidth: HAIRLINE },
  none: null,
};

const s = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  column: {
    height: size.columnHeader, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  group: {
    height: size.groupHeader, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  overline: { ...type.overline, color: color.t3 },
  meta: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center' },
  titleBox: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  meterTitle: { width: 88 },
  title: { ...type.body, color: color.t1, flexShrink: 1 },
  id: { ...type.rowId },
  meterId: { fontSize: 14, letterSpacing: 0 },
  spacer: { flex: 1 },
  bar: { height: 4, borderRadius: 2, backgroundColor: color.barTrack, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  barFixed: { width: 56 },
  barFlex: { flex: 1 },
  value: { color: color.t1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  valueCase: { ...type.rowId, width: 48, letterSpacing: 0 },
  valueMeter: { ...type.body, width: 40 },
});
