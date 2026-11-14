/*
 * Draws the navigator: a header with Back, the screen's name and the case and run it shows, the top screen of
 * the stack, and the tab bar. Tapping the name opens "About this screen" (screen id, mode, contract, build,
 * and "Clear cached images"). Only the top screen is mounted; a covered screen unmounts and reloads its data
 * when shown again. Each screen sits in an error boundary, so a crash blocks only that screen with
 * FATAL_INVALID. The session cover (SessionCover.js) wraps everything.
 */

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View, FlatList, Modal } from 'react-native';
import { fatalInvalid, RECOVERY } from '../api/states.mjs';
import { describeConfig, MODE } from '../config.mjs';
import { StatePanel } from '../components/StateView';
import SessionGate from '../components/SessionCover';
import { clearCachedData, SESSION_LIMITS } from '../components/session.mjs';
import { color, font, MIN_TOUCH, radius, space } from '../components/theme';
import { bindNav, createGuards, initialNavState, navReducer, top } from './navigator.mjs';
import { aboutLines, headerLines, sameContext } from './header.mjs';
import { screenMeta, TABS } from './routes.mjs';
import StudyOverviewScreen from '../screens/v3-study/StudyOverviewScreen';
import CaseListScreen from '../screens/v1-cases/CaseListScreen';
import CaseExplorerScreen from '../screens/v1-cases/CaseExplorerScreen';
import ErrorInspectorScreen from '../screens/v1-cases/ErrorInspectorScreen';
import Inspector3DScreen from '../screens/v2-3d/Inspector3DScreen';
import ReviewCorrectionScreen from '../screens/v4-review/ReviewCorrectionScreen';
import ExperimentComparisonScreen from '../screens/v3-study/ExperimentComparisonScreen';
import FindingsScreen from '../screens/v4-review/FindingsScreen';

// Screen id -> component. Static imports, because Metro bundles only what it can see.
// A test checks this table against routes.mjs, so a renamed screen fails a test, not the phone.

const REGISTRY = Object.freeze({
  'SCR-01': StudyOverviewScreen,
  'SCR-02': CaseListScreen,
  'SCR-03': CaseExplorerScreen,
  'SCR-04': ErrorInspectorScreen,
  'SCR-05': Inspector3DScreen,
  'SCR-06': ReviewCorrectionScreen,
  'SCR-07': ExperimentComparisonScreen,
  'SCR-08': FindingsScreen,
});

function componentFor(screenId) {
  return REGISTRY[screenId] || null;
}

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
        safeMessage: `${this.props.title} failed while rendering and was stopped.`,
        detail: { problems: [String(this.state.error && this.state.error.message)] },
      });
      return (
        <View style={s.crash}>
          <StatePanel view={view} what={this.props.title} onAction={(id) => { if (id === RECOVERY.BACK) this.props.onBack(); }} />
        </View>
      );
    }
    return this.props.children;
  }
}

// `session` overrides the cover limits (tests use seconds instead of minutes).
export default function NavigatorView({ runtime, initialScreenId, session = null }) {
  const [state, dispatch] = useReducer(navReducer, initialScreenId, (id) => initialNavState(id));
  const [navError, setNavError] = useState(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [cacheNote, setCacheNote] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const [reported, setReported] = useState(null); // { key, context } from nav.setContext
  const guards = useMemo(() => createGuards(), []);

  const onContext = useCallback((key, context) => {
    setReported((prev) => (prev && prev.key === key && sameContext(prev.context, context) ? prev : { key, context }));
  }, []);
  const nav = useMemo(
    () => bindNav(dispatch, state, (err) => setNavError(String((err && err.message) || err)), guards, onContext),
    [state, guards, onContext],
  );
  const current = top(state);
  const meta = screenMeta(current.screenId);
  const Screen = componentFor(current.screenId);
  const context = reported && reported.key === current.key ? reported.context : null;
  const head = headerLines(meta, current.params, context, { studyId: runtime.config.studyId });

  // A guard lives only while its screen is on top. Child effects run first, so the new top
  // screen's own guard is already set when this prunes the others.
  useEffect(() => { guards.prune([current.key]); }, [current.key, guards]);
  useEffect(() => { setAboutOpen(false); setCacheNote(null); }, [current.key]);

  // Android back pops, asking the leave guard first. At the root without a guard the system default
  // applies (the app goes to the background). While a guard prompt is open, another press is ignored.
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

  // "Clear cached images" (spec 12 §8). A screen with unsaved work (a leave guard) is never reloaded under the
  // user: the caches stay and the note says why. Otherwise the open screen reloads what it shows.
  const clearCache = useCallback(() => {
    if (guards.get(current.key)) {
      return { cleared: false, text: 'Not cleared: this screen has unsaved work. Save it or leave the screen first.' };
    }
    const result = clearCachedData(runtime);
    if (result.cleared) setEpoch((n) => n + 1);
    return result;
  }, [guards, current.key, runtime]);

  const onBack = useCallback(() => nav.pop(), [nav]);
  const fixture = runtime.mode === MODE.FIXTURE;
  const about = aboutLines(meta, runtime.config, runtime.contract ? runtime.contract.contractVersion : null);

  return (
    <SessionGate limits={session || SESSION_LIMITS} now={session ? session.now : undefined} checkEveryMs={session ? session.checkEveryMs : null} onClearCache={clearCache}>
      <View style={s.root}>
        <View style={s.header} testID={`screen-${meta.id}`}>
          {nav.canGoBack ? (
            <TouchableOpacity style={s.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
              <Text style={s.backT}>‹ Back</Text>
            </TouchableOpacity>
          ) : <View style={s.backSpacer} />}
          <TouchableOpacity
            style={s.titleBox}
            onPress={() => setAboutOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: aboutOpen }}
            accessibilityLabel={`${head.title}${head.subtitle ? `, ${head.subtitle}` : ''}. About this screen`}
          >
            <Text style={s.title} numberOfLines={1}>{head.title}</Text>
            <Text style={s.subtitle} numberOfLines={1}>{head.subtitle ? `${head.subtitle} ` : ''}{aboutOpen ? '▴' : '▾'}</Text>
          </TouchableOpacity>
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
        {aboutOpen && (
          <View style={s.about} testID="about-screen">
            <Text style={s.aboutH}>About this screen</Text>
            {about.map((line) => <Text key={line} style={s.aboutLine} selectable>{line}</Text>)}
            <TouchableOpacity style={s.aboutBtn} onPress={() => setCacheNote(clearCache().text)} accessibilityRole="button">
              <Text style={s.aboutBtnT}>Clear cached images</Text>
            </TouchableOpacity>
            {cacheNote ? <Text style={s.aboutNote}>{cacheNote}</Text> : null}
          </View>
        )}
        {fixture && (
          <Text style={s.banner} numberOfLines={1}>
            Generated contract fixtures - not patient data, not a backend. Tap FIXTURE to choose scenarios.
          </Text>
        )}

        <View style={s.body}>
          <ScreenBoundary key={`${current.key}:${epoch}`} screenId={current.screenId} title={meta.title} onBack={onBack}>
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
                <View style={[s.tabBar, active && s.tabBarActive]} />
                <Text style={[s.tabT, active && s.tabActive]}>{tab.label}</Text>
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
    </SessionGate>
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
  titleBox: { flex: 1, alignItems: 'center', minHeight: MIN_TOUCH, justifyContent: 'center' },
  title: { color: color.text, fontSize: font.h2, fontWeight: '700' },
  subtitle: { color: color.textDim, fontFamily: font.mono, fontSize: font.small, marginTop: 1 },
  mode: { minHeight: MIN_TOUCH, minWidth: 72, justifyContent: 'center', alignItems: 'center', borderRadius: radius.m, borderWidth: 1 },
  modeFixture: { borderColor: color.warn, backgroundColor: color.warnBg },
  modeLive: { borderColor: color.ok, backgroundColor: color.okBg },
  modeT: { fontFamily: font.mono, fontSize: font.small, fontWeight: '700' },
  modeFixtureT: { color: color.warn },
  modeLiveT: { color: color.ok },
  about: {
    backgroundColor: color.surfaceHi, borderBottomWidth: 1, borderBottomColor: color.border,
    paddingHorizontal: space.l, paddingVertical: space.m, gap: 2,
  },
  aboutH: { color: color.textDim, fontSize: font.small, fontWeight: '700', marginBottom: space.xs },
  aboutLine: { color: color.textDim, fontFamily: font.mono, fontSize: font.small },
  aboutBtn: {
    alignSelf: 'flex-start', minHeight: MIN_TOUCH, paddingHorizontal: space.l, marginTop: space.s, borderRadius: radius.m,
    borderWidth: 1, borderColor: color.control, backgroundColor: color.surface, justifyContent: 'center',
  },
  aboutBtnT: { color: color.text, fontSize: font.body, fontWeight: '600' },
  aboutNote: { color: color.textDim, fontSize: font.small, marginTop: space.xs },
  banner: {
    color: color.warn, backgroundColor: color.warnBg, fontSize: font.small, paddingHorizontal: space.m, paddingVertical: space.xs,
  },
  body: { flex: 1 },
  crash: { flex: 1, justifyContent: 'center', padding: space.l },
  toast: {
    position: 'absolute', left: space.l, right: space.l, bottom: 84, padding: space.m, borderRadius: radius.m,
    backgroundColor: color.dangerBg, borderColor: color.danger, borderWidth: 1,
  },
  toastT: { color: color.danger, fontSize: font.body },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.surface },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabBar: { position: 'absolute', top: 0, left: space.l, right: space.l, height: 3, borderRadius: 2 },
  tabBarActive: { backgroundColor: color.accent },
  tabT: { color: color.textDim, fontSize: font.body, fontWeight: '600' },
  tabActive: { color: color.accent },
});

// Fixture mode only: tap an endpoint to cycle through its generated scenarios, so every screen state
// can be shown on the phone. The open screen reloads after each change.

function FixtureScenarioPanel({ visible, onClose, overrides }) {
  const [, setTick] = useState(0);
  useEffect(() => (overrides ? overrides.subscribe(() => setTick((n) => n + 1)) : undefined), [overrides]);
  if (!overrides) return null;

  const rows = overrides.endpoints()
    .map((id) => ({ id, names: overrides.scenariosFor(id), current: overrides.get(id) }))
    .filter((r) => r.names.length > 1);

  const cycle = (row) => {
    const i = row.names.indexOf(row.current);
    overrides.set(row.id, row.names[(i + 1) % row.names.length]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={panel.root}>
        <Text style={panel.h1}>Fixture scenarios</Text>
        <Text style={panel.note}>
          Generated by contracts/api/generate_fixture.py. Tap an endpoint to cycle its scenario; the open screen
          reloads. Live builds have no such panel.
        </Text>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={panel.row} onPress={() => cycle(item)} accessibilityRole="button">
              <Text style={panel.endpoint}>{item.id}</Text>
              <Text style={[panel.scenario, item.current !== 'default' && panel.changed]}>{item.current}</Text>
            </TouchableOpacity>
          )}
        />
        <View style={panel.actions}>
          <TouchableOpacity style={panel.btn} onPress={() => overrides.clear()} accessibilityRole="button">
            <Text style={panel.btnT}>All default</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[panel.btn, panel.btnP]} onPress={onClose} accessibilityRole="button">
            <Text style={panel.btnT}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const panel = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.l, paddingTop: 48 },
  h1: { color: color.text, fontSize: font.h1, fontWeight: '700' },
  note: { color: color.textDim, fontSize: font.small, marginVertical: space.s },
  row: {
    minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: color.border, paddingHorizontal: space.s,
  },
  endpoint: { color: color.text, fontFamily: font.mono, fontSize: font.small, flex: 1 },
  scenario: { color: color.textDim, fontFamily: font.mono, fontSize: font.small },
  changed: { color: color.warn, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.s, marginTop: space.m, marginBottom: space.xl },
  btn: {
    flex: 1, minHeight: MIN_TOUCH, borderRadius: radius.m, borderWidth: 1, borderColor: color.control,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceHi,
  },
  btnP: { borderColor: color.accent, backgroundColor: color.accentBg },
  btnT: { color: color.text, fontSize: font.body, fontWeight: '600' },
});
