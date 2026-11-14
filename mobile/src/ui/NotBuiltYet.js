/*
 * The body of every placeholder screen. A screen that is not built says so,
 * in the same EMPTY_UNAVAILABLE state any unavailable artifact uses, and
 * names the folder its owner replaces - never a mock-up that looks finished
 * (DEMO_STANDARD §9: no spike or stub promoted to look done).
 *
 * It also prints the params it was opened with, so the vertical that builds
 * the real screen can see exactly what the navigator hands it.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { emptyUnavailable, RECOVERY } from '../../../app/core/index.mjs';
import { OWNERS, screenMeta, screenPath } from '../nav/screens.mjs';
import { StatePanel } from './StateView';
import { color, font, MIN_TOUCH, space } from './theme';

const NOT_BUILT = emptyUnavailable('SCREEN_NOT_BUILT', [RECOVERY.BACK]);

export default function NotBuiltYet({ screenId, nav, params, entries = [] }) {
  const meta = screenMeta(screenId);
  const shown = Object.entries(params || {});
  return (
    <ScrollView contentContainerStyle={s.root}>
      <Text style={s.h1}>{meta.id} · {meta.title}</Text>
      <StatePanel
        view={NOT_BUILT}
        what={meta.title}
        onAction={(id) => { if (id === RECOVERY.BACK && nav) nav.pop(); }}
      />
      <View style={s.card}>
        <Text style={s.label}>Owner</Text>
        <Text style={s.value}>{meta.vertical} · {OWNERS[meta.vertical]}</Text>
        <Text style={s.label}>Replace this file</Text>
        <Text style={s.mono} selectable>mobile/{screenPath(screenId)}</Text>
        <Text style={s.label}>Opened with</Text>
        {shown.length === 0
          ? <Text style={s.mono}>(no params)</Text>
          : shown.map(([k, v]) => <Text key={k} style={s.mono} selectable>{k} = {JSON.stringify(v)}</Text>)}
      </View>
      {entries.length > 0 && (
        <View style={s.card}>
          <Text style={s.label}>Entry points this screen will offer</Text>
          {entries.map((e) => (
            <TouchableOpacity
              key={e.label}
              style={s.btn}
              onPress={() => nav && nav.push(e.screenId, e.params || {})}
              accessibilityRole="button"
            >
              <Text style={s.btnT}>{e.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.l, gap: space.m },
  h1: { color: color.text, fontSize: font.h1, fontWeight: '700' },
  card: { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 10, padding: space.l },
  label: { color: color.textDim, fontSize: font.small, marginTop: space.s },
  value: { color: color.text, fontSize: font.body, marginTop: 2 },
  mono: { color: color.text, fontFamily: font.mono, fontSize: font.small, marginTop: 2 },
  btn: {
    minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.l, marginTop: space.s,
    borderRadius: 8, borderWidth: 1, borderColor: color.border, backgroundColor: color.surfaceHi,
  },
  btnT: { color: color.accent, fontSize: font.body, fontWeight: '600' },
});
