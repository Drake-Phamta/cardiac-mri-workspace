import { deliverFrameProbe, frameProbePayload, localProbeSink, selectMeshLevel } from './webview_probe.js';

let passed = 0;
function equal(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  passed += 1;
}
function throws(callback, fragment, name) {
  try {
    callback();
  } catch (error) {
    if (String(error).includes(fragment)) { passed += 1; return; }
    throw error;
  }
  throw new Error(`${name}: did not throw`);
}

const levels = [{ level: 0, obj: 'mesh/out/level_0_cell1.obj' }, { level: 3, obj: 'mesh/out/level_3_cell4.obj' }];
const selection = selectMeshLevel('?mesh=synthetic&level=3', levels);
equal(selection.level, 3, 'selects requested decimation level');
equal(selection.selected.obj, 'mesh/out/level_3_cell4.obj', 'keeps manifest object path');
equal(selectMeshLevel('', levels).level, 0, 'defaults to level zero');
throws(() => selectMeshLevel('?mesh=patient&level=0', levels), 'unsupported mesh', 'rejects unknown mesh id');
throws(() => selectMeshLevel('?level=1.5', levels), 'non-negative integer', 'rejects fractional level');
throws(() => selectMeshLevel('?level=2', levels), 'not present', 'rejects unavailable level');

equal(localProbeSink('?probe_sink=/probe', 'http://127.0.0.1:8765/app/'), 'http://127.0.0.1:8765/probe', 'resolves same-origin sink');
throws(() => localProbeSink('?probe_sink=https://example.com/probe', 'http://127.0.0.1:8765/app/'), 'same-origin', 'rejects off-origin sink');

const payload = frameProbePayload({ median_fps: 25 }, { mesh_level: 0 });
equal(payload.kind, 'spike_b_frame_probe', 'labels frame probe payload');
equal(payload.probe.median_fps, 25, 'preserves raw probe result');
let native = null;
let request = null;
const outcome = await deliverFrameProbe(payload, {
  nativePostMessage: (body) => { native = JSON.parse(body); },
  fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 201 }; },
  sinkUrl: 'http://127.0.0.1:8765/probe',
});
equal(outcome.native, 'posted', 'posts to the React Native bridge');
equal(outcome.http, 'posted', 'posts to the workstation fallback');
equal(native.kind, 'spike_b_frame_probe', 'native bridge gets same payload');
equal(request.options.method, 'POST', 'workstation fallback uses POST');

console.log(`webview probe tests: ${passed} passed`);
