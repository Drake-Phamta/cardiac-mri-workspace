/*
 * Cardiac MRI Workspace - the app shell.
 *
 * Loads the runtime (build config + contract + one app/core client), then
 * hands it to the navigator. If the runtime cannot be built - a contract the
 * app/core loader refuses, a fixture bundle that drifted, a bad base URL -
 * the app shows that as a blocking screen with every problem listed, rather
 * than starting with a client it cannot trust.
 */

import React, { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import NavigatorView from './src/nav/NavigatorView';
import { ROOT_SCREEN_ID } from './src/nav/screens.mjs';
import { loadRuntime } from './src/runtime/loadRuntime';
import { RuntimeProvider } from './src/runtime/RuntimeContext';
import { color, font, space } from './src/ui/theme';

function BuildInvalid({ error }) {
  const config = typeof error.code === 'string' && error.code.startsWith('CONFIG_');
  return (
    <ScrollView contentContainerStyle={s.invalid}>
      <Text style={s.tag}>{config ? 'CONFIGURATION ERROR' : 'FATAL INVALID'}</Text>
      <Text style={s.h1}>{config ? 'This build is not configured' : 'This build cannot start safely'}</Text>
      <Text style={s.body}>{error.message}</Text>
      {error.code ? <Text style={s.problem} selectable>code {error.code}</Text> : null}
      {error.problems.map((p, i) => <Text key={i} style={s.problem} selectable>{p}</Text>)}
      <Text style={s.hint}>
        {config
          ? 'Nothing was requested from any server. Fixture builds need no configuration; a live build needs the backend URL at build time (mobile/README.md, "Live mode").'
          : 'Regenerate the build inputs with `npm run prepare-app` in mobile/, then rebuild. If the contract changed, app/core/contract.mjs and the generator must agree with it first.'}
      </Text>
    </ScrollView>
  );
}

export default function App() {
  const { runtime, error } = useMemo(() => loadRuntime(), []);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={color.bg} />
      <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
        {runtime ? (
          <RuntimeProvider runtime={runtime}>
            <NavigatorView runtime={runtime} initialScreenId={ROOT_SCREEN_ID} />
          </RuntimeProvider>
        ) : (
          <View style={s.root}><BuildInvalid error={error} /></View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  invalid: { padding: space.xl },
  tag: { color: color.danger, fontFamily: font.mono, fontSize: font.small, letterSpacing: 1 },
  h1: { color: color.danger, fontSize: font.h1, fontWeight: '700', marginVertical: space.s },
  body: { color: color.text, fontSize: font.body },
  problem: { color: color.textDim, fontFamily: font.mono, fontSize: font.small, marginTop: space.xs },
  hint: { color: color.textDim, fontSize: font.small, marginTop: space.l },
});
