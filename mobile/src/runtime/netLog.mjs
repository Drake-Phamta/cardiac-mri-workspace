/*
 * Network accounting per slice gesture - the phone-side evidence for L4,
 * NFR-PERF-001 limb 2: "a slice gesture never triggers a full-volume
 * transfer".
 *
 * A screen opens a gesture when the user asks for a slice and closes it when
 * that slice is on screen; every network request in between - JSON API calls
 * (httpTransport), MRI and mask artifact bytes (imageStore, maskStore) - is
 * attributed to it. Closing writes ONE logcat line:
 *
 *   CMW_GESTURE {"seq","kind","case","from","to","requests":[{"endpoint","bytes","ms","status"}],
 *                "cache_hit","bytes_total","max_request_bytes","ms","outcome"}
 *
 * cache_hit is true exactly when the gesture caused no network request at all.
 * Bytes are the response body as received (Content-Length when the server
 * sends it, else the counted body). Nothing here contains a payload, a URL
 * or a host - only endpoint ids and sizes (TC-SEC-003, no address in logs).
 * A gesture that is superseded by the next one is closed with outcome
 * "superseded", never silently merged into it.
 *
 * A request belongs to the gesture that was open when it STARTED (#77 QA N-3):
 * the caller reads `openSeq` before it sends and passes it to record() as
 * `seq`. A response that lands after its gesture closed is counted as `late`,
 * never filed under the gesture open at that moment; one that started with
 * no gesture open is `unattributed`. totals() keeps both, and SCR-03 logs it
 * as CMW_NET_TOTALS after each scripted pass's CMW_RUN_END.
 */

export function createNetLog({ log = (line) => console.log(line), now = () => Date.now() } = {}) {
  let seq = 0;
  let open = null;
  const totals = { gestures: 0, requests: 0, bytes: 0, unattributed: 0, late: 0 };

  function end({ outcome = 'shown' } = {}) {
    if (!open) return null;
    const g = open;
    open = null;
    totals.gestures += 1;
    let bytesTotal = 0;
    let maxBytes = 0;
    for (const r of g.requests) {
      bytesTotal += r.bytes || 0;
      maxBytes = Math.max(maxBytes, r.bytes || 0);
    }
    const rec = {
      seq: g.seq,
      kind: g.kind,
      case: g.case,
      from: g.from,
      to: g.to,
      requests: g.requests,
      cache_hit: g.requests.length === 0,
      bytes_total: bytesTotal,
      max_request_bytes: maxBytes,
      ms: Math.round(now() - g.t0),
      outcome,
    };
    log(`CMW_GESTURE ${JSON.stringify(rec)}`);
    return rec;
  }

  return Object.freeze({
    // kind: 'slice' (a slice switch - what L4 judges), 'open' (the first
    // slice of a case), 'variant' (a prediction-variant switch, from === to).
    begin({ caseId = null, from = null, to = null, kind = 'slice' } = {}) {
      if (open) end({ outcome: 'superseded' });
      seq += 1;
      open = { seq, kind, case: caseId, from, to, t0: now(), requests: [] };
      return seq;
    },
    // seq: openSeq when the request started (null: none was open). Left out,
    // the request is taken to start now.
    record({ endpoint, bytes = null, ms = null, status = null, seq = open ? open.seq : null }) {
      totals.requests += 1;
      totals.bytes += bytes || 0;
      if (seq === null) { totals.unattributed += 1; return; }
      if (!open || open.seq !== seq) { totals.late += 1; return; }
      open.requests.push({
        endpoint,
        bytes: Number.isFinite(bytes) ? bytes : null,
        ms: Number.isFinite(ms) ? Math.round(ms) : null,
        status,
      });
    },
    end,
    get openSeq() { return open ? open.seq : null; },
    get openTo() { return open ? open.to : null; },
    totals: () => ({ ...totals }),
  });
}

// UTF-8 byte length of a string, for a body read as text without a
// Content-Length header. Hermes-safe (no TextEncoder needed).
export function utf8Length(text) {
  const s = String(text);
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i += 1; }
    else n += 3;
  }
  return n;
}
