/*
 * Draws any screen state, so loading, errors and empty states look the same on every screen: a placeholder
 * where the content will be, the state named in words, the cause, the reference code, and the state's one
 * action. Children render only in SUCCESS, the one state with data, so old data is never drawn under an error.
 * The text and actions come from stateCopy.mjs.
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { STATE } from '../api/states.mjs';
import { useRuntime } from '../api/RuntimeContext';
import { describeState, TONE } from './stateCopy.mjs';
import { color, font, MIN_TOUCH, radius, space } from './theme';

const TONE_STYLE = {
  [TONE.NEUTRAL]: { borderColor: color.border, backgroundColor: color.surface, titleColor: color.text },
  [TONE.INFO]: { borderColor: color.accent, backgroundColor: color.accentBg, titleColor: color.info },
  [TONE.WARN]: { borderColor: color.warn, backgroundColor: color.warnBg, titleColor: color.warn },
  [TONE.DANGER]: { borderColor: color.danger, backgroundColor: color.dangerBg, titleColor: color.danger },
};

// A text mark per state, next to its name (the name is always printed: never colour alone, spec 10 §9).
const MARK = {
  [STATE.EMPTY_UNAVAILABLE]: '–',
  [STATE.RECOVERABLE_ERROR]: '!',
  [STATE.STALE_MISMATCH]: '↻',
  [STATE.FATAL_INVALID]: '×',
};

export function StatePanel({ view, what, onAction, compact = false }) {
  const runtime = useRuntime();
  const [open, setOpen] = useState(false);
  const d = describeState(view, { what, apiBaseUrl: runtime && runtime.config ? runtime.config.apiBaseUrl : null });
  const tone = TONE_STYLE[d.tone] || TONE_STYLE[TONE.NEUTRAL];
  // The first detail is the code or reason: always shown, so a blocked view still names its reference (spec 10 §8).
  // The rest (HTTP status, request id, problems) folds away.
  const [reference, ...more] = d.details;
  const mark = MARK[d.state] || null;
  return (
    <View
      style={[s.panel, compact && s.compact, { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor }]}
      accessibilityRole={d.blocking ? 'alert' : undefined}
      testID={`state-${d.state}`}
    >
      <View style={s.titleRow}>
        {d.spinner && <ActivityIndicator color={tone.titleColor} style={s.spinner} />}
        {!d.spinner && mark ? (
          <View style={[s.mark, { borderColor: tone.titleColor }]}>
            <Text style={[s.markT, { color: tone.titleColor }]}>{mark}</Text>
          </View>
        ) : null}
        <Text style={[s.stateTag, { color: tone.titleColor }]}>{d.state.replace(/_/g, ' ')}</Text>
      </View>
      {d.title ? <Text style={[s.title, { color: tone.titleColor }]}>{d.title}</Text> : null}
      {d.body ? <Text style={s.body}>{d.body}</Text> : null}
      {reference ? <Text style={s.detail} selectable>{reference}</Text> : null}
      {more.length > 0 && (
        <TouchableOpacity
          style={s.more}
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={s.moreT}>{open ? 'Hide details' : `Details (${more.length})`}</Text>
        </TouchableOpacity>
      )}
      {open && more.map((line, i) => <Text key={i} style={s.detail} selectable>{line}</Text>)}
      {d.actions.length > 0 && onAction && (
        <View style={s.actions}>
          {d.actions.map((a, i) => (
            <TouchableOpacity
              key={a.id}
              style={[s.btn, i > 0 && s.btnSecondary]}
              onPress={() => onAction(a.id)}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <Text style={[s.btnT, i > 0 && s.btnTSecondary]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// Grey bars where the content will appear, so a loading screen keeps its shape instead of going blank.
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
  center: { flex: 1, justifyContent: 'center', padding: space.l, gap: space.l },
  panel: { borderWidth: 1, borderRadius: radius.l, padding: space.l },
  compact: { padding: space.m },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs, gap: space.s },
  spinner: { marginRight: space.xs },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markT: { fontSize: font.small, fontWeight: '700', lineHeight: 16 },
  stateTag: { fontFamily: font.mono, fontSize: font.small, letterSpacing: 1 },
  title: { fontSize: font.h2, fontWeight: '700', marginBottom: space.xs },
  body: { color: color.text, fontSize: font.body, lineHeight: 20 },
  detail: { color: color.textDim, fontFamily: font.mono, fontSize: font.small, marginTop: space.xs },
  more: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  moreT: { color: color.accent, fontSize: font.small, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.m, gap: space.s },
  btn: {
    minHeight: MIN_TOUCH, minWidth: 120, paddingHorizontal: space.l, borderRadius: radius.m,
    backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center',
  },
  btnSecondary: { backgroundColor: color.surfaceHi, borderWidth: 1, borderColor: color.control },
  btnT: { color: color.bg, fontSize: font.body, fontWeight: '700' },
  btnTSecondary: { color: color.text },
  placeholder: { gap: space.s, opacity: 0.6 },
  phBlock: { height: 120, borderRadius: radius.l, backgroundColor: color.surfaceHi },
  phLine: { height: 12, borderRadius: radius.s, backgroundColor: color.surfaceHi },
});
