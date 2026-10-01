/*
 * SPIKE_A — pure serialisation for stage S8 (A8: save / reload), shared by the
 * app and by harness/test_persist.mjs.
 *
 * THROWAWAY SPIKE CODE. Boundary: spikes/spike_a_2d/**.
 *
 * No React and no filesystem here, for the same reason as viewerMath.js and
 * brushMath.js: the functions the phone runs are replayed offline before any
 * device session. App.js does the file I/O; this file only turns masks into
 * bytes and back.
 *
 * WHY RUN-LENGTH AND NOT RAW BYTES. A working mask is one byte per voxel:
 * 576 x 576 x 88 is 29.2 MB raw, and ~39 MB once base64 has padded it for a
 * text file. Writing that would measure JSON and base64, not persistence. The
 * mask is binary and spatially coherent, so runs are what any real
 * implementation would store, and it is what makes the A8 number mean
 * "saving a correction" rather than "writing 39 MB".
 *
 * WHAT IS SAVED. Every slice, not only the edited ones. A reviewed mask in
 * `11` is a whole artifact with a checksum, not a patch, and a format that
 * could only round-trip the slices someone happened to touch would answer an
 * easier question than the one A8 asks.
 *
 * Format v1 (one JSON document):
 *   { format: 'spike_a_working_mask/v1', nx, ny, nz,
 *     runs:   [ [n0, n1, n2, ...], ... ]   per slice, alternating run lengths
 *                                          STARTING WITH THE VALUE 0
 *     sha256: [ '...', ... ]               per slice, of the decoded bytes
 *     volume_sha256: '...' }
 *
 * The per-slice sha256 is written by the saver and re-checked by the loader.
 * That is the whole point of A8: "it reloaded" is not the claim, "it reloaded
 * the same bytes" is, and a round trip that quietly loses a corrected voxel
 * would otherwise look like a success.
 */

import { sha256Hex } from './viewerMath.js';

export const FORMAT = 'spike_a_working_mask/v1';

/*
 * One slice -> alternating run lengths, starting with a run of value 0. A
 * slice that begins with 1 therefore starts with a zero-length run, which
 * costs one number and removes the need for a separate "first value" field.
 */
export function rleEncodeSlice(buf) {
  const runs = [];
  let value = 0;
  let count = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] ? 1 : 0;
    if (v === value) { count += 1; continue; }
    runs.push(count);
    value = v;
    count = 1;
  }
  runs.push(count);
  return runs;
}

export function rleDecodeSlice(runs, length) {
  const buf = new Uint8Array(length);
  let at = 0;
  let value = 0;
  for (let i = 0; i < runs.length; i++) {
    const n = runs[i];
    if (value === 1) buf.fill(1, at, at + n);
    at += n;
    value = value === 1 ? 0 : 1;
  }
  if (at !== length) {
    throw new Error(`rle length mismatch: runs cover ${at}, expected ${length}`);
  }
  return buf;
}

// Split from encodeWorking so the device session can time run-length coding
// and checksumming separately. They are both part of saving - `11` gives a
// reviewed mask a checksum - but they scale differently, and one A8 number
// that hides which half dominates is a number nobody can act on.
export function encodeRuns(slices) {
  return slices.map(rleEncodeSlice);
}

export function hashSlices(slices) {
  return slices.map(sha256Hex);
}

export function encodeWorking(slices, nx, ny) {
  return {
    format: FORMAT,
    nx,
    ny,
    nz: slices.length,
    runs: encodeRuns(slices),
    sha256: hashSlices(slices),
    volume_sha256: volumeHash(slices),
  };
}

/*
 * Returns { slices, verified, mismatches }. It does NOT throw on a checksum
 * mismatch: a spike that hides a bad reload behind an exception reports
 * "reload failed" when the finding is "reload silently changed N slices",
 * and those are different results for GATE-MOB-01.
 */
export function decodeRuns(doc) {
  if (!doc || doc.format !== FORMAT) {
    throw new Error(`unknown format ${doc && doc.format}`);
  }
  const length = doc.nx * doc.ny;
  const slices = [];
  for (let z = 0; z < doc.nz; z++) slices.push(rleDecodeSlice(doc.runs[z], length));
  return slices;
}

export function verifySlices(slices, sha256) {
  const mismatches = [];
  for (let z = 0; z < slices.length; z++) {
    if (sha256Hex(slices[z]) !== sha256[z]) mismatches.push(z);
  }
  return mismatches;
}

export function decodeWorking(doc) {
  const slices = decodeRuns(doc);
  const mismatches = verifySlices(slices, doc.sha256);
  return { slices, verified: doc.nz - mismatches.length, mismatches };
}

export function volumeHash(slices) {
  let n = 0;
  for (const b of slices) n += b.length;
  const all = new Uint8Array(n);
  let o = 0;
  for (const b of slices) { all.set(b, o); o += b.length; }
  return sha256Hex(all);
}

// How many slices of `working` differ from `source`. Reported alongside A8 so
// a save time can be read against how much was actually corrected.
export function editedSlices(working, source) {
  const out = [];
  for (let z = 0; z < working.length; z++) {
    const a = working[z];
    const b = source[z];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { out.push(z); break; }
    }
  }
  return out;
}
