/*
 * SPIKE_B S-1 — React Native container for the real-mesh device session.
 *
 * THROWAWAY SPIKE CODE under spikes/spike_b_3d/. Day 22 (2026-10-01), written by a Claude
 * agent under the leader's recovery override; Spike B owner Vu Hung Anh adopts or rejects
 * it on Day 23. Operator: Pham Tuan Anh (DR-006a). The operator computes no B number.
 *
 * PROVENANCE. Same stack as the S7 container (spikes/spike_a_2d/app, PR #46 head fba88b3):
 * package.json and package-lock.json are byte-identical copies (Expo 57, React Native
 * 0.86.3, react-native-webview 13.16.1, expo-build-properties for cleartext to the
 * workstation). The WebView props, the before-load error hooks and the chunked logcat
 * transport are copied from that App.js. Spike A's App.js is not touched.
 *
 * What is new:
 *  - the page and the five real-mesh levels are APK ASSETS (file:///android_asset/spike_b_s1/),
 *    staged by spikes/spike_b_3d/s1/stage_assets.py and never committed;
 *  - every message from the page is logged (tag SPIKE_B_S1, chunked) AND POSTed to the
 *    workstation collector through adb reverse (two independent evidence paths);
 *  - B7: a resolved pick arrives as s1_nav_request; this screen shows THAT slice of the
 *    mask in the 2D panel, logs which slice it actually displayed (s1_rn_nav_displayed)
 *    once the image has loaded, and only then acknowledges the page. Background picks
 *    never send a request, so they cannot navigate (B9).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const TAG = 'SPIKE_B_S1';
const CHUNK_CHARS = 3000;
const COLLECTOR_URL = 'http://127.0.0.1:8766/s1';
const PAGE_URI = 'file:///android_asset/spike_b_s1/index.html';
const LEVELS = [0, 1, 2, 3, 4];
const SESSION_ID = `s1-${Date.now()}`;
const sliceUri = (z) => `asset:/spike_b_s1/slices/slice_${String(z).padStart(3, '0')}.png`;
const now = () => (global.performance ? performance.now() : Date.now());

// --- evidence transport -------------------------------------------------------------------
// Logcat cuts a line at ~4 KB, so long messages are split exactly like the S7 container:
//   SPIKE_B_S1_CHUNK <id> <index>/<count> <slice>
let chunkSeq = 0;
const transport = { posted: 0, postFailures: 0, logged: 0 };

function logChunked(text) {
  transport.logged += 1;
  if (text.length <= CHUNK_CHARS) {
    console.log(`${TAG} ${text}`);
    return;
  }
  chunkSeq += 1;
  const id = `${Date.now()}-${chunkSeq}`;
  const count = Math.ceil(text.length / CHUNK_CHARS);
  for (let i = 0; i < count; i += 1) {
    console.log(`${TAG}_CHUNK ${id} ${i + 1}/${count} ${text.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS)}`);
  }
}

function emit(objOrText) {
  const text = typeof objOrText === 'string' ? objOrText : JSON.stringify(objOrText);
  logChunked(text);
  fetch(COLLECTOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text })
    .then((response) => { if (response.ok) transport.posted += 1; else transport.postFailures += 1; })
    .catch(() => { transport.postFailures += 1; });
}

// Installed before the page's scripts run (copied from the S7 container), plus the config.
const beforeLoad = (level) => `
window.S1_CONFIG = ${JSON.stringify({ level, session_id: SESSION_ID })};
(function () {
  function post(obj) { try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {} }
  window.addEventListener('error', function (ev) {
    post({ kind: 'webview_error', message: String(ev.message), source: ev.filename || null, line: ev.lineno || null });
  });
  window.addEventListener('unhandledrejection', function (ev) { post({ kind: 'webview_rejection', reason: String(ev.reason) }); });
})();
true;
`;

export default function App() {
  const web = useRef(null);
  const [level, setLevel] = useState(0);
  const [webKey, setWebKey] = useState(0);
  const [status, setStatus] = useState('choose a level');
  const [loadedInfo, setLoadedInfo] = useState(null);
  const [tapLabel, setTapLabel] = useState('surface');
  const [nav, setNav] = useState(null);            // { pick_id, slice, voxel, t_request }
  const [shown, setShown] = useState(null);        // last DISPLAYED nav
  const [counts, setCounts] = useState({ picks: 0, navs: 0, displayed: 0, noNav: 0, probes: 0 });
  const displayedSlice = useRef(null);
  const crop = useRef(null);

  useEffect(() => {
    emit({ kind: 's1_rn_app_start', session_id: SESSION_ID, platform: Platform.OS,
      os_version: Platform.Version, constants: Platform.constants || null, t_ms: now() });
  }, []);

  const send = useCallback((cmd) => {
    const js = `window.__s1Receive && window.__s1Receive(${JSON.stringify(JSON.stringify(cmd))}); true;`;
    if (web.current) web.current.injectJavaScript(js);
  }, []);

  const openLevel = (n) => {
    setLevel(n);
    setLoadedInfo(null);
    setNav(null);
    setShown(null);
    displayedSlice.current = null;
    setWebKey((k) => k + 1);
    setStatus(`loading level ${n}…`);
    emit({ kind: 's1_rn_open_level', session_id: SESSION_ID, level: n, t_ms: now() });
  };

  const acknowledge = (request, displayed, alreadyDisplayed, imageSource) => {
    const record = {
      kind: 's1_rn_nav_displayed', session_id: SESSION_ID, pick_id: request.pick_id, level: request.level,
      requested_slice: request.slice, displayed_slice: displayed, image_uri: sliceUri(displayed),
      image_source_reported: imageSource || null, already_displayed: alreadyDisplayed,
      latency_ms: Number((now() - request.t_request).toFixed(3)), t_ms: now(),
    };
    emit(record);
    displayedSlice.current = displayed;
    setShown(request);
    setCounts((c) => ({ ...c, displayed: c.displayed + 1 }));
    send({ cmd: 'nav_ack', pick_id: request.pick_id, displayed_slice: displayed });
    send({ cmd: 'set_slice', slice: displayed });           // 2D -> 3D plane band
  };

  const onMessage = (event) => {
    const data = event.nativeEvent.data;
    emit(data);                                              // every page message, verbatim
    let msg = null;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (!msg || !msg.kind) return;
    if (msg.kind === 's1_loaded') {
      crop.current = msg.slice_crop || null;
      setLoadedInfo({ triangles: msg.triangles_parsed, expected: msg.triangles_expected });
      setStatus(`L${msg.level} loaded · ${msg.triangles_parsed} triangles (expected ${msg.triangles_expected})`);
    } else if (msg.kind === 's1_nav_request') {
      setCounts((c) => ({ ...c, navs: c.navs + 1 }));
      const request = { ...msg, t_request: now() };
      if (displayedSlice.current === msg.slice) {
        acknowledge(request, msg.slice, true, null);
      } else {
        setNav(request);                                     // the Image below reports onLoad
      }
    } else if (msg.kind === 's1_pick') {
      setCounts((c) => ({ ...c, picks: c.picks + 1, noNav: c.noNav + (msg.navigation_posted ? 0 : 1) }));
    } else if (msg.kind === 's1_frame_probe') {
      setCounts((c) => ({ ...c, probes: c.probes + 1 }));
      setStatus(`L${msg.level} · B10/B11 run ${msg.run_index} complete (${msg.probe && msg.probe.sample_count} frames) · hands off`);
    } else if (msg.kind === 's1_suite_done') {
      setStatus(`L${msg.level} SUITE DONE · now rotate/zoom by hand, then TARGETS @ CAMERA, then taps`);
    } else if (msg.kind === 's1_target_test_done') {
      setStatus(`L${msg.level} target test at your camera done · next: taps (label ${tapLabel})`);
    } else if (msg.kind === 's1_error' || msg.kind === 'webview_error') {
      setStatus(`ERROR: ${msg.message}`);
    }
  };

  const toggleLabel = () => {
    const next = tapLabel === 'surface' ? 'background' : 'surface';
    setTapLabel(next);
    send({ cmd: 'set_tap_label', label: next });
  };

  const marker = shown && crop.current && shown.voxel ? {
    left: ((shown.voxel[0] - crop.current.x0 + 0.5) / crop.current.size) * PANEL - 5,
    top: ((shown.voxel[1] - crop.current.y0 + 0.5) / crop.current.size) * PANEL - 5,
  } : null;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Text style={s.h1}>Spike B S-1 · real mesh · level {level}</Text>
      <Text style={s.status} numberOfLines={2}>{status}</Text>
      <View style={s.row}>
        {LEVELS.map((n) => (
          <Btn key={n} label={`L${n}`} onPress={() => openLevel(n)} active={n === level && webKey > 0} />
        ))}
      </View>
      <View style={s.row}>
        <Btn label="RUN SUITE" onPress={() => send({ cmd: 'run_suite' })} disabled={!loadedInfo} primary />
        <Btn label="TARGETS @ CAMERA" onPress={() => send({ cmd: 'run_target_test' })} disabled={!loadedInfo} />
        <Btn label={`TAP: ${tapLabel.toUpperCase()}`} onPress={toggleLabel} disabled={!loadedInfo} />
        <Btn label="FIT" onPress={() => send({ cmd: 'fit_camera' })} disabled={!loadedInfo} />
      </View>
      <View style={s.web}>
        {webKey > 0 ? (
          <WebView
            key={webKey}
            ref={web}
            style={s.web}
            source={{ uri: `${PAGE_URI}#level=${level}` }}
            originWhitelist={['*']}
            javaScriptEnabled
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            androidLayerType="hardware"
            setSupportMultipleWindows={false}
            injectedJavaScriptBeforeContentLoaded={beforeLoad(level)}
            onLoadEnd={(e) => emit({ kind: 's1_rn_webview_loaded', level, url: e.nativeEvent.url, t_ms: now() })}
            onError={(e) => emit({ kind: 's1_rn_webview_error', level, error: e.nativeEvent, t_ms: now() })}
            onMessage={onMessage}
          />
        ) : (
          <Text style={s.hint}>Tap a level (L0 = undecimated). The page and meshes are inside this APK.</Text>
        )}
      </View>
      <View style={s.panel}>
        <View style={s.sliceBox}>
          {nav ? (
            <Image
              key={`${nav.pick_id}`}
              source={{ uri: sliceUri(nav.slice) }}
              style={s.sliceImg}
              resizeMode="contain"
              onLoad={(e) => acknowledge(nav, nav.slice, false, e.nativeEvent && e.nativeEvent.source)}
              onError={(e) => emit({ kind: 's1_rn_nav_error', pick_id: nav.pick_id, slice: nav.slice, error: e.nativeEvent, t_ms: now() })}
            />
          ) : <Text style={s.hint}>2D slice</Text>}
          {marker ? <View style={[s.marker, marker]} /> : null}
        </View>
        <View style={s.panelText}>
          <Text style={s.big}>{shown ? `slice ${shown.slice}` : '—'}</Text>
          <Text style={s.small}>{shown ? `from pick ${shown.pick_id} (${shown.phase})` : 'no navigation yet'}</Text>
          <Text style={s.small}>picks {counts.picks} · navs {counts.navs} · shown {counts.displayed} · no-nav {counts.noNav}</Text>
          <Text style={s.small}>probe runs {counts.probes} · POST ok {transport.posted} · POST fail {transport.postFailures}</Text>
          <Text style={s.small}>session {SESSION_ID}</Text>
        </View>
      </View>
    </View>
  );
}

const PANEL = 150;

function Btn({ label, onPress, disabled, primary, active }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, primary && s.btnPrimary, active && s.btnActive, disabled && s.btnDisabled]}
    >
      <Text style={s.btnT}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e1116', paddingTop: 40, paddingHorizontal: 8 },
  h1: { color: '#e8eaed', fontSize: 16, fontWeight: '700' },
  status: { color: '#9eeaf0', fontSize: 12, fontFamily: 'monospace', minHeight: 32 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 3 },
  btn: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 6, backgroundColor: '#1c2430', marginRight: 6, marginBottom: 4 },
  btnPrimary: { backgroundColor: '#1f5f8b' },
  btnActive: { borderWidth: 2, borderColor: '#9eeaf0' },
  btnDisabled: { opacity: 0.4 },
  btnT: { color: '#e8eaed', fontSize: 13, fontWeight: '600' },
  web: { flex: 1, backgroundColor: '#000' },
  hint: { color: '#8b939b', fontSize: 12, padding: 10 },
  panel: { flexDirection: 'row', paddingVertical: 6, height: PANEL + 12 },
  sliceBox: { width: PANEL, height: PANEL, backgroundColor: '#000', marginRight: 8 },
  sliceImg: { width: PANEL, height: PANEL },
  marker: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#ff3b30' },
  panelText: { flex: 1 },
  big: { color: '#ffb84d', fontSize: 22, fontWeight: '700' },
  small: { color: '#8b939b', fontSize: 11, fontFamily: 'monospace' },
});
