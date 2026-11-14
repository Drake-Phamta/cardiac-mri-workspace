/*
 * Draws any screen state, so loading, errors and empty states look the same on every screen: a placeholder
 * where the content will be, the state named in words, the cause, the reference code, and the state's one
 * action. Children render only in SUCCESS, the one state with data, so old data is never drawn under an error.
 * The text and actions come from stateCopy.mjs. Direction A: no box, hairlines above and below, the state's
 * colour only on its icon and name.
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { STATE } from '../api/states.mjs';
import { useRuntime } from '../api/RuntimeContext';
import { Button } from './Controls';
import { IconAlert, IconChevronDown, IconChevronUp, IconInfo } from './icons';
import { describeState, TONE } from './stateCopy.mjs';
import { color, HAIRLINE, MIN_TOUCH, radius, space, type } from './theme';

const TONE_COLOR = {
  [TONE.NEUTRAL]: color.t3,
  [TONE.INFO]: color.accent,
  [TONE.WARN]: color.warn,
  [TONE.DANGER]: color.danger,
};

// The icon next to the state's name (the name is always printed: never colour alone, spec 10 §9).
const ICON = {
  [STATE.EMPTY_UNAVAILABLE]: IconInfo,
  [STATE.RECOVERABLE_ERROR]: IconAlert,
  [STATE.STALE_MISMATCH]: IconAlert,
  [STATE.FATAL_INVALID]: IconAlert,
};

export function StatePanel({ view, what, onAction, compact = false }) {
  const runtime = useRuntime();
  const [open, setOpen] = useState(false);
  const d = describeState(view, { what, apiBaseUrl: runtime && runtime.config ? runtime.config.apiBaseUrl : null });
  const tone = TONE_COLOR[d.tone] || TONE_COLOR[TONE.NEUTRAL];
  // The first detail is the code or reason: always shown, so a blocked view still names its reference (spec 10 §8).
  // The rest (HTTP status, request id, problems) folds away.
  const [reference, ...more] = d.details;
  const Icon = ICON[d.state] || null;
  return (
    <View style={[s.panel, compact && s.compact]} accessibilityRole={d.blocking ? 'alert' : undefined} testID={`state-${d.state}`}>
      <View style={s.stateRow}>
        {d.spinner ? <ActivityIndicator size="small" color={tone === color.t3 ? color.t2 : tone} /> : null}
        {!d.spinner && Icon ? <Icon size={18} strokeWidth={2} color={tone} /> : null}
        <Text style={[s.stateName, { color: tone }]}>{d.state.replace(/_/g, ' ')}</Text>
      </View>
      {d.title ? <Text style={s.title}>{d.title}</Text> : null}
      {d.body ? <Text style={s.body}>{d.body}</Text> : null}
      {reference ? <Text style={s.detail} selectable>{reference}</Text> : null}
      {more.length > 0 && (
        <TouchableOpacity
          style={s.more}
          onPress={() => setOpen((o) => !o)}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={s.moreT}>{open ? 'Hide details' : `Details (${more.length})`}</Text>
          {open ? <IconChevronUp size={16} strokeWidth={2} color={color.accent} /> : <IconChevronDown size={16} strokeWidth={2} color={color.accent} />}
        </TouchableOpacity>
      )}
      {open && more.map((line, i) => <Text key={i} style={s.detail} selectable>{line}</Text>)}
      {d.actions.length > 0 && onAction && (
        <View style={s.actions}>
          {d.actions.map((a, i) => (
            <Button key={a.id} label={a.label} variant={i === 0 ? 'primary' : 'secondary'} onPress={() => onAction(a.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

// Bars where the content will appear, so a loading screen keeps its shape instead of going blank.
export function Placeholder({ lines = 3 }) {
  return (
    <View style={s.placeholder} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="placeholder">
      <View style={s.phBlock} />
      {Array.from({ length: lines }, (_, i) => <View key={i} style={[s.phLine, { width: `${90 - i * 20}%` }]} />)}
    </View>
  );
}

export default function StateView({ view, what, onAction, children }) {
  if (!view) return null;
  if (view.state === STATE.SUCCESS) {
    return typeof children === 'function' ? children(view.data) : (children || null);
  }
  const waiting = view.state === STATE.LOADING || view.state === STATE.PROCESSING;
  return (
    <View style={s.center}>
      {waiting ? <Placeholder /> : null}
      <StatePanel view={view} what={what} onAction={onAction} />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: space.l, gap: space.xl },
  panel: {
    paddingVertical: space.l, gap: space.xs,
    borderTopWidth: HAIRLINE, borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  compact: { paddingVertical: space.m },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.xs },
  stateName: { ...type.overline },
  title: { ...type.title, color: color.t1 },
  body: { ...type.body, color: color.t2 },
  detail: { ...type.caption, color: color.t3, fontVariant: ['tabular-nums'] },
  more: { alignSelf: 'flex-start', minHeight: MIN_TOUCH - 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  moreT: { ...type.secondary, fontWeight: '500', color: color.accent },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.m, gap: space.s },
  placeholder: { gap: space.s },
  phBlock: { height: 120, borderRadius: radius.m, backgroundColor: color.field },
  phLine: { height: 12, borderRadius: radius.xs, backgroundColor: color.field },
});
