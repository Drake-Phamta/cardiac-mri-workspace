/*
 * Wraps the app: counts touches and background time (session.mjs) and, once a limit is reached, draws an opaque
 * cover over everything until the user taps "Show the screen". The screens stay mounted underneath, so nothing
 * is lost; while covered they are hidden from accessibility services and the back button does nothing.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { coverText, createSessionClock, SESSION_LIMITS } from './session.mjs';
import { color, font, MIN_TOUCH, radius, space } from './theme';

export default function SessionGate({ children, limits = SESSION_LIMITS, now, checkEveryMs = null, onClearCache = null }) {
  const clock = useMemo(
    () => createSessionClock({ now, backgroundMs: limits.backgroundMs, idleMs: limits.idleMs }),
    // One clock for the life of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [reason, setReason] = useState(null);
  const [cleared, setCleared] = useState(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const st = next === 'active' ? clock.toForeground() : clock.toBackground();
      if (st.covered) setReason(st.reason);
    });
    return () => sub.remove();
  }, [clock]);

  useEffect(() => {
    const every = checkEveryMs || Math.max(1000, Math.min(30000, Math.floor(limits.idleMs / 4)));
    const t = setInterval(() => {
      const st = clock.tick();
      if (st.covered) setReason(st.reason);
    }, every);
    return () => clearInterval(t);
  }, [clock, checkEveryMs, limits.idleMs]);

  // Only while covered: Android back must not change the screen behind the cover.
  useEffect(() => {
    if (!reason) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [reason]);

  const show = () => { clock.uncover(); setReason(null); setCleared(null); };
  const clear = async () => {
    if (!onClearCache) return;
    const result = await onClearCache();
    if (result) setCleared(result.text);
  };
  const text = reason ? coverText(reason, limits) : null;

  return (
    <View style={s.root} onStartShouldSetResponderCapture={() => { clock.touch(); return false; }}>
      <View style={s.root} importantForAccessibility={reason ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={Boolean(reason)}>
        {children}
      </View>
      {text ? (
        <View style={s.cover} testID="session-cover" accessibilityViewIsModal>
          <Text style={s.title}>{text.title}</Text>
          <Text style={s.body}>{text.body}</Text>
          <TouchableOpacity style={s.primary} onPress={show} accessibilityRole="button">
            <Text style={s.primaryT}>Show the screen</Text>
          </TouchableOpacity>
          {onClearCache ? (
            <TouchableOpacity style={s.secondary} onPress={clear} accessibilityRole="button">
              <Text style={s.secondaryT}>Clear cached images</Text>
            </TouchableOpacity>
          ) : null}
          {cleared ? <Text style={s.note}>{cleared}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  cover: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: color.bg,
    padding: space.xl, justifyContent: 'center', gap: space.m,
  },
  title: { color: color.text, fontSize: font.h1, fontWeight: '700' },
  body: { color: color.textDim, fontSize: font.body, lineHeight: 20 },
  primary: {
    minHeight: MIN_TOUCH, borderRadius: radius.m, backgroundColor: color.accent,
    alignItems: 'center', justifyContent: 'center', marginTop: space.s,
  },
  primaryT: { color: color.bg, fontSize: font.body, fontWeight: '700' },
  secondary: {
    minHeight: MIN_TOUCH, borderRadius: radius.m, borderWidth: 1, borderColor: color.control,
    backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center',
  },
  secondaryT: { color: color.text, fontSize: font.body, fontWeight: '600' },
  note: { color: color.textDim, fontSize: font.small },
});
