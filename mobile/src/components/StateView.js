/*
 * Renders any of the seven app/core screen states. Every screen in every
 * vertical uses this instead of drawing its own spinner or error box, so the
 * `10` §8 state model looks and behaves the same across V1-V4.
 *
 *   <StateView view={view} what="the case list"
 *              onAction={(id) => ...}>
 *     {(data) => <TheRealScreen data={data} />}
 *   </StateView>
 *
 * Children render ONLY in SUCCESS - app/core guarantees `data` is non-null
 * there and null everywhere else, so a stale payload can never be drawn
 * under an error banner. The copy and the actions come from stateCopy.mjs.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { STATE } from '../../../app/core/index.mjs';
import { useRuntime } from '../runtime/RuntimeContext';
import { describeState, TONE } from './stateCopy.mjs';
import { color, font, MIN_TOUCH, space } from './theme';

const TONE_STYLE = {
  [TONE.NEUTRAL]: { borderColor: color.border, backgroundColor: color.surface, titleColor: color.text },
  [TONE.INFO]: { borderColor: color.accent, backgroundColor: color.accentBg, titleColor: color.info },
  [TONE.WARN]: { borderColor: color.warn, backgroundColor: color.warnBg, titleColor: color.warn },
  [TONE.DANGER]: { borderColor: color.danger, backgroundColor: color.dangerBg, titleColor: color.danger },
};

export function StatePanel({ view, what, onAction, compact = false }) {
  const runtime = useRuntime();
  const d = describeState(view, { what, apiBaseUrl: runtime && runtime.config ? runtime.config.apiBaseUrl : null });
  const tone = TONE_STYLE[d.tone] || TONE_STYLE[TONE.NEUTRAL];
  return (
    <View
      style={[s.panel, compact && s.compact, { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor }]}
      accessibilityRole={d.blocking ? 'alert' : undefined}
      testID={`state-${d.state}`}
    >
      <View style={s.titleRow}>
        {d.spinner && <ActivityIndicator color={tone.titleColor} style={s.spinner} />}
        {/* The state name is printed, not only coloured: `10` §9 - never colour alone. */}
        <Text style={[s.stateTag, { color: tone.titleColor }]}>{d.state.replace(/_/g, ' ')}</Text>
      </View>
      {d.title ? <Text style={[s.title, { color: tone.titleColor }]}>{d.title}</Text> : null}
      {d.body ? <Text style={s.body}>{d.body}</Text> : null}
      {d.details.length > 0 && (
        <View style={s.details}>
          {d.details.map((line, i) => (
            <Text key={i} style={s.detail} selectable>{line}</Text>
          ))}
        </View>
      )}
      {d.actions.length > 0 && onAction && (
        <View style={s.actions}>
          {d.actions.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={s.btn}
              onPress={() => onAction(a.id)}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <Text style={s.btnT}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function StateView({ view, what, onAction, children }) {
  if (!view) return null;
  if (view.state === STATE.SUCCESS) {
    return typeof children === 'function' ? children(view.data) : (children || null);
  }
  return (
    <View style={s.center}>
      <StatePanel view={view} what={what} onAction={onAction} />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: space.l },
  panel: { borderWidth: 1, borderRadius: 10, padding: space.l },
  compact: { padding: space.m },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  spinner: { marginRight: space.s },
  stateTag: { fontFamily: font.mono, fontSize: font.small, letterSpacing: 1 },
  title: { fontSize: font.h2, fontWeight: '700', marginBottom: space.xs },
  body: { color: color.text, fontSize: font.body, lineHeight: 20 },
  details: { marginTop: space.s },
  detail: { color: color.textDim, fontFamily: font.mono, fontSize: font.small, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.m, gap: space.s },
  btn: {
    minHeight: MIN_TOUCH, minWidth: 96, paddingHorizontal: space.l, borderRadius: 8, borderWidth: 1,
    borderColor: color.accent, backgroundColor: color.accentBg, alignItems: 'center', justifyContent: 'center',
  },
  btnT: { color: color.accent, fontSize: font.body, fontWeight: '600' },
});
