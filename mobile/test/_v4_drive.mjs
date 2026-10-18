// Test helper for the V4 controllers (SCR-06 / SCR-08).
//
// The controllers never read an endpoint themselves: they say what they WANT
// (`getState().wants`) and a screen fetches it with the shell's useCall
// (DR-021 rule 2). These helpers do what the screen's <RunReader>,
// <SliceReader> and findings list hook do, in plain node: call the same
// endpoints with the same params and hand the answers back.
import { createHash } from 'node:crypto';

import { success } from '../../app/core/index.mjs';

// Serve what the review controller wants, until it wants nothing.
export async function drive(ctl, client, { max = 40 } = {}) {
  for (let i = 0; i < max; i += 1) {
    const { wants } = ctl.getState();
    if (wants.run) {
      await ctl.provideRun(await client.call('analysis_run_get', { run_id: wants.run.runId }));
    } else if (wants.slice) {
      const w = wants.slice;
      const prediction = await client.call('prediction_slice_get', { run_id: w.runId, slice_index: w.z, variant: w.variant });
      const mri = w.needsMri ? await client.call('mri_slice_get', { case_id: w.caseId, slice_index: w.z }) : null;
      const reviewed = w.baseVersionId
        ? await client.call('reviewed_mask_slice_get', { reviewed_mask_id: w.baseVersionId, slice_index: w.z }) : null;
      await ctl.provideSlice(w.z, { prediction, mri, reviewed });
    } else {
      return ctl.getState();
    }
  }
  throw new Error('drive: the controller still wants something after the guard');
}

// The findings screen's list read.
export async function loadList(ctl, client, options = {}) {
  return ctl.provideList(await client.call('findings_list', {}, options));
}

export const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// A runtime.content stand-in that serves `table[kind]` bytes (kind = 'mask' for the
// source prediction, 'reviewed' for a committed version) and records every ask.
export function fakeContent(table) {
  const calls = [];
  return {
    calls,
    uri: (u) => `http://backend.test:8000${u}`,
    bytes: async (url, opts) => {
      calls.push({ url, opts });
      const entry = table[opts.kind];
      if (typeof entry === 'function') return entry(url, opts);
      return success({ bytes: entry, size: entry.length, checksum: opts.checksum, verified: true });
    },
  };
}

// A client over `client` that rewrites the answers of chosen endpoints.
export function patchedClient(client, patches) {
  return {
    ...client,
    call: async (id, params, options) => {
      const view = await client.call(id, params, options);
      return patches[id] ? patches[id](view, params) : view;
    },
  };
}
