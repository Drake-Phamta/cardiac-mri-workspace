/*
 * Wraps the app: counts touches and background time (session.mjs) and, once a limit is reached, draws an opaque
 * cover over everything until the user taps "Show the screen". The screens stay mounted underneath, so nothing
 * is lost; while covered they are hidden from accessibility services and the back button does nothing.
 * SessionCoverContext tells a sheet (DetailsSheet.js) to hide itself, because a Modal would draw over the cover.
 */

import React, { createContext, useEffect, useMemo, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, View } from 'react-native';

import { Button } from './Controls';
import { IconShield } from './icons';
import { coverText, createSessionClock, SESSION_LIMITS } from './session.mjs';
import { color, space, type } from './theme';

export const SessionCoverContext = createContext(false);

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
    <SessionCoverContext.Provider value={Boolean(reason)}>
      <View style={s.root} onStartShouldSetResponderCapture={() => { clock.touch(); return false; }}>
        <View style={s.root} importantForAccessibility={reason ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={Boolean(reason)}>
          {children}
        </View>
        {text ? (
          <View style={s.cover} testID="session-cover" accessibilityViewIsModal>
            <IconShield size={32} color={color.accent} />
            <Text style={s.title} accessibilityRole="header">{text.title}</Text>
            <Text style={s.body}>{text.body}</Text>
            <View style={s.actions}>
              <Button label="Show the screen" onPress={show} block />
              {onClearCache ? <Button label="Clear cached images" variant="secondary" onPress={clear} block /> : null}
            </View>
            {cleared ? <Text style={s.note}>{cleared}</Text> : null}
          </View>
        ) : null}
      </View>
    </SessionCoverContext.Provider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  cover: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: color.bg,
    paddingHorizontal: space.xl, justifyContent: 'center', gap: space.m,
  },
  title: { ...type.screenTitle, color: color.t1, marginTop: space.xs },
  body: { ...type.body, color: color.t2 },
  actions: { gap: space.m, marginTop: space.m },
  note: { ...type.caption, color: color.t2 },
});
