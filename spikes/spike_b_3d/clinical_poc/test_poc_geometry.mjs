// Execute the MPR entry point with an independent physical-coordinate fixture.
// No source images, browser install or generated OBJ are needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./poc.js', import.meta.url), 'utf8');
const reference = {
  coordinate_system: 'RAS', spatial_unit: 'mm', source_origin_reference: 'voxel_center',
  shape_xyz: [2, 2, 4], source_shape_xyz: [4, 6, 4], downsample_xyz: [2, 3, 1],
  source_spacing_xyz_mm: [0.7, 0.8, 2.4], preview_spacing_xyz_mm: [1.4, 2.4, 2.4],
  source_origin_ras_mm: [20, -30, 5], centroid_preview_xyz: [1, 1, 2],
  segment: 'geometry fixture', label_value: 1, segment_voxels: 1,
  segment_volume_ml: 0.001344, landmarks_unavailable: [],
};

async function runEntry(name, metadata) {
  const messages = [];
  const nodes = new Map();
  const context = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {}, save() {}, restore() {}, setLineDash() {}, beginPath() {},
    moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
  };
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      width: 4, height: 4, textContent: '', listeners: {},
      getContext: () => context,
      addEventListener(type, handler) { this.listeners[type] = handler; },
      contentWindow: { postMessage: (message, origin) => messages.push({ message, origin }) },
    });
    return nodes.get(selector);
  };
  const previous = Object.fromEntries(['document', 'window', 'fetch'].map((key) => [key, globalThis[key]]));
  globalThis.document = { querySelector: node };
  globalThis.window = { location: { origin: 'http://localhost:8768' }, addEventListener() {} };
  globalThis.fetch = async (path) => ({
    ok: true,
    json: async () => structuredClone(metadata),
    arrayBuffer: async () => new Uint8Array(16).fill(path.includes('mask') ? 1 : 80).buffer,
  });
  try {
    await import(`data:text/javascript,${encodeURIComponent(`${source}\n// fixture: ${name}`)}`);
    return { nodes, messages };
  } catch (error) {
    return { nodes, messages, error };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

const valid = await runEntry('valid-centres', reference);
assert.equal(valid.error, undefined);
assert.equal(valid.nodes.get('#coords').textContent, 'RAS 21.4, -27.6, 9.8 mm · source IJK 2, 3, 2');
assert.equal(valid.nodes.get('#three').src, 'clinical-app/index.html?mode=clinical');
assert.equal(valid.messages.at(-1).message.z, 9.8, 'linked plane must pass through the NIfTI voxel centre');
assert.equal(valid.messages.at(-1).origin, 'http://localhost:8768');

const old = { ...reference };
delete old.source_origin_reference;
const stale = await runEntry('old-payload', old);
assert.match(stale.error.message, /rebuild/i);
assert.match(stale.nodes.get('#coords').textContent, /rebuild/i);
assert.equal(stale.nodes.get('#three')?.src, undefined, 'unverified old geometry must not load a mesh');
assert.equal(stale.messages.length, 0);

const wrongUnit = await runEntry('wrong-unit', { ...reference, spatial_unit: 'meter' });
assert.match(wrongUnit.error.message, /geometry/i);
assert.equal(wrongUnit.nodes.get('#three')?.src, undefined);
assert.equal(wrongUnit.messages.length, 0);

console.log('local MPR geometry checks: 3 passed (voxel centres, stale payload, physical units)');
