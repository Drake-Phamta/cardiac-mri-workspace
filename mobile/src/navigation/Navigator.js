/*
 * Draws the navigator: the app bar (Back, the screen's name and the case and run it shows, Live or Fixture, Info),
 * the top screen of the stack, and the tab bar. Info opens the Details sheet (screen id, mode, contract, build, and "Clear cached images"). Only the top
 * screen is mounted; a covered screen unmounts and reloads its data when shown again. Each screen sits in an error
 * boundary, so a crash blocks only that screen with FATAL_INVALID. The session cover (SessionCover.js) wraps
 * everything.
 */

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View, FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fatalInvalid, RECOVERY } from '../api/states.mjs';
import { describeConfig, MODE } from '../config.mjs';
import AppHeader from '../components/AppHeader';
import { Button } from '../components/Controls';
import DetailsSheet from '../components/DetailsSheet';
import { IconAlert, IconFlag, IconFlask, IconGrid, IconGridFilled, IconList } from '../components/icons';
import { StatePanel } from '../components/StateView';
import SessionGate from '../components/SessionCover';
import { clearCachedData, SESSION_LIMITS } from '../components/session.mjs';
import { color, HAIRLINE, MIN_TOUCH, radius, size, space, type } from '../components/theme';
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
  // (An open Details sheet takes the back press itself: it is a Modal, which closes on onRequestClose.)
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
        <AppHeader
          testID={`screen-${meta.id}`}
          title={head.title}
          subtitle={head.subtitle}
          onBack={nav.canGoBack ? onBack : null}
          status={fixture ? 'fixture' : 'live'}
          onStatusPress={fixture ? () => setScenarioOpen(true) : null}
          statusLabel={describeConfig(runtime.config)}
          onInfo={() => setAboutOpen(true)}
        />
        {fixture && (
          <Text style={s.banner} numberOfLines={2}>
            Generated contract fixtures: not patient data, not a backend. Tap Fixture to choose scenarios.
          </Text>
        )}

        <View style={s.body}>
          <ScreenBoundary key={`${current.key}:${epoch}`} screenId={current.screenId} title={meta.title} onBack={onBack}>
            {Screen ? <Screen runtime={runtime} nav={nav} params={current.params} /> : null}
          </ScreenBoundary>
        </View>

        {navError && (
          <View style={s.toast} accessibilityRole="alert">
            <IconAlert size={18} strokeWidth={2} color={color.danger} />
            <Text style={s.toastT}>Cannot open: {navError}</Text>
          </View>
        )}

        <TabBar activeScreenId={state.stack[0].screenId} onSelect={(id) => nav.reset(id, {})} />

        <DetailsSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} sections={[{ title: 'This screen', lines: about }]}>
          <View style={s.sheetActions}>
            <Button label="Clear cached images" variant="secondary" onPress={() => setCacheNote(clearCache().text)} />
            {cacheNote ? <Text style={s.note}>{cacheNote}</Text> : null}
          </View>
        </DetailsSheet>

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

// The tab bar: a 22 dp icon and an 11 dp label per tab. The active tab is accent, with a 32 x 2 bar on the top
// edge; the others are t3. The tab's name is always written, so the active one never depends on colour alone.
const TAB_ICON = Object.freeze({
  Study: { off: IconGrid, on: IconGridFilled },
  Cases: { off: IconList, on: IconList },
  Experiments: { off: IconFlask, on: IconFlask },
  Findings: { off: IconFlag, on: IconFlag },
});

function TabBar({ activeScreenId, onSelect }) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const active = activeScreenId === tab.screenId;
        const icons = TAB_ICON[tab.label];
        const Icon = icons ? (active ? icons.on : icons.off) : null;
        const tint = active ? color.accent : color.t3;
        return (
          <TouchableOpacity
            key={tab.screenId}
            style={s.tab}
            onPress={() => onSelect(tab.screenId)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            testID={`tab-${tab.label}`}
          >
            {active ? <View style={s.tabIndicator} /> : null}
            {Icon ? <Icon size={size.tabIcon} color={tint} /> : null}
            <Text style={[s.tabT, { color: tint }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  banner: {
    ...type.caption, color: color.t2, paddingHorizontal: space.l, paddingVertical: space.s,
    borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  body: { flex: 1 },
  crash: { flex: 1, justifyContent: 'center', paddingHorizontal: space.l },
  toast: {
    position: 'absolute', left: space.l, right: space.l, bottom: size.tabBar + HAIRLINE + space.l,
    flexDirection: 'row', alignItems: 'center', gap: space.s,
    paddingHorizontal: space.m, paddingVertical: space.m, borderRadius: radius.m, backgroundColor: color.raised,
  },
  toastT: { ...type.body, color: color.t1, flex: 1 },
  sheetActions: { gap: space.s },
  note: { ...type.caption, color: color.t2 },
  tabs: {
    height: size.tabBar + HAIRLINE, flexDirection: 'row', backgroundColor: color.bg,
    borderTopWidth: HAIRLINE, borderColor: color.hair,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  // Sits on the tab bar's top hairline, as in the mockup.
  tabIndicator: {
    position: 'absolute', top: -HAIRLINE, left: '50%', marginLeft: -16, width: 32, height: 2,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: color.accent,
  },
  tabT: { ...type.micro },
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
      <SafeAreaView style={panel.root} edges={['top', 'bottom']}>
        <View style={panel.head}>
          <Text style={panel.h1} accessibilityRole="header">Fixture scenarios</Text>
          <Text style={panel.note}>
            Generated by contracts/api/generate_fixture.py. Tap an endpoint to cycle its scenario; the open screen
            reloads. Live builds have no such panel.
          </Text>
        </View>
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
          <Button label="All default" variant="secondary" onPress={() => overrides.clear()} block />
          <Button label="Close" onPress={onClose} block />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const panel = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  head: { paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.s, gap: space.s },
  h1: { ...type.screenTitle, color: color.t1 },
  note: { ...type.secondary, color: color.t2 },
  row: {
    minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.l,
    marginHorizontal: space.l, borderBottomWidth: HAIRLINE, borderColor: color.hair,
  },
  endpoint: { ...type.secondary, color: color.t1, flex: 1 },
  scenario: { ...type.caption, color: color.t2 },
  changed: { color: color.warn, fontWeight: '600' },
  actions: { gap: space.s, padding: space.l },
});
