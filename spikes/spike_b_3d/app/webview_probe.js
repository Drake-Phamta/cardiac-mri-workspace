/*
 * URL selection and delivery helpers for the SPIKE_B diagnostic viewer.
 *
 * The WebView bridge is available only inside React Native.  The same payload
 * may also be POSTed to the local workstation server exposed through adb
 * reverse, so the operator has a raw file even when logcat is unavailable.
 */

export const FRAME_PROBE_KIND = 'spike_b_frame_probe';
export const FRAME_PROBE_SCHEMA_VERSION = '1.0';

export function selectMeshLevel(search, levels) {
  const query = new URLSearchParams(search);
  const meshId = query.get('mesh') || 'synthetic';
  const rawLevel = query.get('level') || '0';
  if (meshId !== 'synthetic') {
    throw new Error(`unsupported mesh ${JSON.stringify(meshId)}; this diagnostic viewer only ships synthetic`);
  }
  if (!/^(0|[1-9][0-9]*)$/.test(rawLevel)) {
    throw new Error(`level must be a non-negative integer; got ${JSON.stringify(rawLevel)}`);
  }
  const level = Number(rawLevel);
  const selected = levels.find((entry) => entry.level === level);
  if (!selected) throw new Error(`mesh level ${level} is not present in mesh_levels.json`);
  return { meshId, level, selected };
}

export function localProbeSink(search, pageUrl) {
  const raw = new URLSearchParams(search).get('probe_sink');
  if (!raw) return null;
  const sink = new URL(raw, pageUrl);
  const page = new URL(pageUrl);
  if (sink.origin !== page.origin || !['http:', 'https:'].includes(sink.protocol)) {
    throw new Error('probe_sink must be a same-origin HTTP(S) endpoint');
  }
  return sink.href;
}

export function frameProbePayload(result, metadata) {
  return {
    kind: FRAME_PROBE_KIND,
    schema_version: FRAME_PROBE_SCHEMA_VERSION,
    recorded_at_utc: new Date().toISOString(),
    probe: result,
    device: metadata,
  };
}

export async function deliverFrameProbe(payload, { nativePostMessage, fetchImpl, sinkUrl } = {}) {
  const serialized = JSON.stringify(payload);
  const outcome = { native: 'not_available', http: sinkUrl ? 'not_sent' : 'not_configured' };
  if (typeof nativePostMessage === 'function') {
    try {
      nativePostMessage(serialized);
      outcome.native = 'posted';
    } catch (error) {
      outcome.native = `failed: ${String(error)}`;
    }
  }
  if (sinkUrl && typeof fetchImpl === 'function') {
    try {
      const response = await fetchImpl(sinkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
        keepalive: true,
      });
      outcome.http = response.ok ? 'posted' : `failed: HTTP ${response.status}`;
    } catch (error) {
      outcome.http = `failed: ${String(error)}`;
    }
  }
  return outcome;
}
