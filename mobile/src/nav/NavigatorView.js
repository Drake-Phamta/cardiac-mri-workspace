/*
 * Renders the navigator: a header with Back and the screen id, the top
 * screen of the stack, and the tab bar of the `10` §2 tree (Study, Cases,
 * Experiments, Findings). Android's back button pops the stack.
 *
 * Each screen is wrapped in an error boundary. Four verticals land code in
 * this app; one of them throwing must block ITS screen with a visible
 * FATAL_INVALID, not take the other three down with a white crash.
 *
 * Only the TOP screen is mounted. A screen that is covered by a push, popped,
 * replaced or reset away UNMOUNTS - its React state is gone, and it re-reads
 * what it needs when it is shown again. A screen with something to lose
 * registers nav.setLeaveGuard(fn) (see navigator.mjs) and is asked first.
 */

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fatalInvalid, RECOVERY } from '../../../app/core/index.mjs';
import { describeConfig, MODE } from '../config.mjs';
import { componentFor } from '../registry';
import { StatePanel } from '../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../ui/theme';
import FixtureScenarioPanel from '../ui/FixtureScenarioPanel';
import { bindNav, createGuards, initialNavState, navReducer, top } from './navigator.mjs';
import { screenMeta, TABS } from './screens.mjs';

class ScreenBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.log(`CMW_SCREEN_CRASH ${JSON.stringify({ screenId: this.props.screenId, message: String(error && error.message) })}`);
  }

  render() {
    if (this.state.error) {
      const view = fatalInvalid({
        code: 'SCREEN_CRASHED',
        safeMessage: `${this.props.screenId} failed while rendering and was stopped.`,
        detail: { problems: [String(this.state.error && this.state.error.message)] },
      });
      return (
        <View style={s.crash}>
          <StatePanel view={view} what={this.props.screenId} onAction={(id) => { if (id === RECOVERY.BACK) this.props.onBack(); }} />
        </View>
      );
    }
    return this.props.children;
  }
}

export default function NavigatorView({ runtime, initialScreenId }) {
  const [state, dispatch] = useReducer(navReducer, initialScreenId, (id) => initialNavState(id));
  const [navError, setNavError] = useState(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const guards = useMemo(() => createGuards(), []);

  const nav = useMemo(
    () => bindNav(dispatch, state, (err) => setNavError(String((err && err.message) || err)), guards),
    [state, guards],
  );
  const current = top(state);
  const meta = screenMeta(current.screenId);
  const Screen = componentFor(current.screenId);

  // A guard lives while its screen is on top (#77 QA N-7): a covered screen
  // unmounts, so its guard goes too - it never answers for edits that are gone.
  // Child effects run first, so the new top screen's own guard is already set.
  useEffect(() => { guards.prune([current.key]); }, [current.key, guards]);

  // Android back: pop (asking the current screen's leave guard, if any). At
  // the root with no guard the system default applies (the app goes to the
  // background); at the root WITH a guard, the guard decides first. While a
  // guard prompt is open, another press is consumed and refused.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (nav.canGoBack) { nav.pop(); return true; }
      const guard = guards.get(current.key);
      if (!guard) return false;
      if (!guards.hold()) return true;
      Promise.resolve()
        .then(() => guard({ type: 'EXIT', screenId: null, params: null }))
        .then((ok) => { guards.release(); if (ok === true) BackHandler.exitApp(); }, () => { guards.release(); });
      return true;
    });
    return () => sub.remove();
  }, [nav, guards, current.key]);

  useEffect(() => {
    if (!navError) return undefined;
    const t = setTimeout(() => setNavError(null), 4000);
    return () => clearTimeout(t);
  }, [navError]);

  // A fixture scenario change re-mounts the screen, so it re-fetches.
  useEffect(() => {
    if (!runtime.fixtureScenarios) return undefined;
    return runtime.fixtureScenarios.subscribe(() => setEpoch((n) => n + 1));
  }, [runtime]);

  const onBack = useCallback(() => nav.pop(), [nav]);
  const fixture = runtime.mode === MODE.FIXTURE;

  return (
    <View style={s.root}>
      <View style={s.header}>
        {nav.canGoBack ? (
          <TouchableOpacity style={s.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={s.backT}>‹ Back</Text>
          </TouchableOpacity>
        ) : <View style={s.backSpacer} />}
        <View style={s.titleBox}>
          <Text style={s.screenId}>{meta.id} · {meta.vertical}</Text>
          <Text style={s.title} numberOfLines={1}>{meta.title}</Text>
        </View>
        <TouchableOpacity
          style={[s.mode, fixture ? s.modeFixture : s.modeLive]}
          onPress={() => fixture && setScenarioOpen(true)}
          disabled={!fixture}
          accessibilityRole="button"
          accessibilityLabel={describeConfig(runtime.config)}
        >
          <Text style={[s.modeT, fixture ? s.modeFixtureT : s.modeLiveT]}>{fixture ? 'FIXTURE' : 'LIVE'}</Text>
        </TouchableOpacity>
      </View>
      {fixture && (
        <Text style={s.banner} numberOfLines={1}>
          Generated contract fixtures - not patient data, not a backend. Tap FIXTURE to choose scenarios.
        </Text>
      )}

      <View style={s.body}>
        <ScreenBoundary key={`${current.key}:${epoch}`} screenId={current.screenId} onBack={onBack}>
          {Screen ? <Screen runtime={runtime} nav={nav} params={current.params} /> : null}
        </ScreenBoundary>
      </View>

      {navError && (
        <View style={s.toast} accessibilityRole="alert">
          <Text style={s.toastT}>Cannot open: {navError}</Text>
        </View>
      )}

      <View style={s.tabs}>
        {TABS.map((tab) => {
          const active = state.stack[0].screenId === tab.screenId;
          return (
            <TouchableOpacity
              key={tab.screenId}
              style={s.tab}
              onPress={() => nav.reset(tab.screenId, {})}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[s.tabT, active && s.tabActive]}>{tab.label}</Text>
              <Text style={[s.tabId, active && s.tabActive]}>{tab.screenId}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {fixture && (
        <FixtureScenarioPanel
          visible={scenarioOpen}
          onClose={() => setScenarioOpen(false)}
          overrides={runtime.fixtureScenarios}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s, paddingTop: space.s,
    paddingBottom: space.s, borderBottomWidth: 1, borderBottomColor: color.border, backgroundColor: color.surface,
  },
  back: { minHeight: MIN_TOUCH, minWidth: 72, justifyContent: 'center', paddingHorizontal: space.s },
  backT: { color: color.accent, fontSize: font.h2, fontWeight: '600' },
  backSpacer: { width: 72 },
  titleBox: { flex: 1, alignItems: 'center' },
  screenId: { color: color.textDim, fontFamily: font.mono, fontSize: font.small },
  title: { color: color.text, fontSize: font.h2, fontWeight: '700' },
  mode: { minHeight: MIN_TOUCH, minWidth: 72, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 1 },
  modeFixture: { borderColor: color.warn, backgroundColor: color.warnBg },
  modeLive: { borderColor: color.ok, backgroundColor: color.okBg },
  modeT: { fontFamily: font.mono, fontSize: font.small, fontWeight: '700' },
  modeFixtureT: { color: color.warn },
  modeLiveT: { color: color.ok },
  banner: {
    color: color.warn, backgroundColor: color.warnBg, fontSize: font.small, paddingHorizontal: space.m, paddingVertical: space.xs,
  },
  body: { flex: 1 },
  crash: { flex: 1, justifyContent: 'center', padding: space.l },
  toast: {
    position: 'absolute', left: space.l, right: space.l, bottom: 84, padding: space.m, borderRadius: 8,
    backgroundColor: color.dangerBg, borderColor: color.danger, borderWidth: 1,
  },
  toastT: { color: color.danger, fontSize: font.body },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.surface },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabT: { color: color.textDim, fontSize: font.body, fontWeight: '600' },
  tabId: { color: color.textFaint, fontFamily: font.mono, fontSize: 10 },
  tabActive: { color: color.accent },
});
