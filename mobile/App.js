/*
 * The app root: loads the runtime and hands it to the navigator. If the runtime cannot be built (a bad
 * contract, fixture bundle or base URL), it shows a blocking screen that lists every problem instead.
 */

import React, { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import NavigatorView from './src/navigation/Navigator';
import { ROOT_SCREEN_ID } from './src/navigation/routes.mjs';
import { loadRuntime, RuntimeProvider } from './src/api/RuntimeContext';
import { IconAlert } from './src/components/icons';
import { color, space, type } from './src/components/theme';

function BuildInvalid({ error }) {
  const config = typeof error.code === 'string' && error.code.startsWith('CONFIG_');
  return (
    <ScrollView contentContainerStyle={s.invalid}>
      <View style={s.tagRow}>
        <IconAlert size={18} strokeWidth={2} color={color.danger} />
        <Text style={s.tag}>{config ? 'CONFIGURATION ERROR' : 'FATAL INVALID'}</Text>
      </View>
      <Text style={s.h1}>{config ? 'This build is not configured' : 'This build cannot start safely'}</Text>
      <Text style={s.body}>{error.message}</Text>
      {error.code ? <Text style={s.problem} selectable>code {error.code}</Text> : null}
      {error.problems.map((p, i) => <Text key={i} style={s.problem} selectable>{p}</Text>)}
      <Text style={s.hint}>
        {config
          ? 'Nothing was requested from any server. Fixture builds need no configuration; a live build needs the backend URL at build time (mobile/README.md, "Live mode").'
          : 'Regenerate the build inputs with `npm run prepare-app` in mobile/, then rebuild. If the contract changed, mobile/src/api/contract.mjs and the generator must agree with it first.'}
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
  invalid: { padding: space.l, paddingTop: space.xl },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  tag: { ...type.overline, color: color.danger },
  h1: { ...type.screenTitle, color: color.t1, marginTop: space.s, marginBottom: space.xs },
  body: { ...type.body, color: color.t2 },
  problem: { ...type.caption, color: color.t3, fontVariant: ['tabular-nums'], marginTop: space.xs },
  hint: { ...type.caption, color: color.t2, marginTop: space.l },
});
