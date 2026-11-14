// node --test mobile/test/  - V2 SCR-05: TC-3D-003, TC-3D-004 and TC-MAINT-002 through the canonical geometry fixture
//
// The fixture is tests/fixtures/geometry/geometry_fixture_v0.json (DR-008a, the same file the backend and the reference
// checker run): a 48 x 40 x 24 grid with spacing [0.625, 0.75, 1.25] and origin [-12.5, 7.25, -30], 33 points and 13
// picking rays, each with the slice it must resolve to, and the rule "floor, reject out of range, never clamp".
// The synthetic blob its rays target is meshed here by a test helper (_v2mesh.mjs, an independent copy of the
// occupancy definition) and loaded into the viewer page, so the pick code that runs is the page's own.
// What this proves: the page resolves every canonical ray to the expected slice exactly (no tolerance), the slice band
// of slice k is the slab z = k to k + 1 that the fixture's points fall in, and a tap at the screen position of a
// visible face still names that face's slice after the camera has been rotated, zoomed and panned.
// What it cannot prove: the same on the phone's GPU, or the frame rate (the owner's device test), or physical
// millimetres: the app works in the voxel-index frame and shows none (the dataset headers are not validated).
import test from 'node:test';
import assert from 'node:assert/strict';

import { selectionAfterPick } from '../src/screens/v2-3d/inspector3d.mjs';
import { blobMesh, CANONICAL, encodeMesh } from './_v2mesh.mjs';
import { makeViewer } from './_v2viewer.mjs';

const SHAPE = CANONICAL.shape_xyz;
const SPACING = CANONICAL.spacing_xyz_mm;
const ORIGIN = CANONICAL.origin_world_mm;
const toVoxel = (world) => world.map((c, i) => (c - ORIGIN[i]) / SPACING[i]);
const toWorldZ = (voxelZ) => ORIGIN[2] + voxelZ * SPACING[2];

const MESH = blobMesh(SHAPE);
const BYTES = encodeMesh({ ...MESH, indexBytes: MESH.vertices.length > 65535 ? 4 : 2 });
function viewerWithBlob() {
  const v = makeViewer();
  v.load('prediction', BYTES);
  assert.deepEqual(v.events('error'), []);
  return v;
}

test('TC-MAINT-002 the fixture under test is the canonical one: 33 points, 13 rays, the exact contract version', () => {
  assert.equal(CANONICAL.fixture_id, 'GEOM_CANONICAL_V1');
  assert.equal(CANONICAL.geometry_contract_version, 'dr008a-dr012/v1.0.0');
  assert.equal(CANONICAL.points.length, 33);
  assert.equal(CANONICAL.picking_rays.length, 13);
  assert.equal(CANONICAL.transform.rounding, 'floor');
  assert.match(CANONICAL.transform.out_of_range, /^REJECT/);
  assert.deepEqual(CANONICAL.picking_rays.map((r) => r.group).filter((g, i, all) => all.indexOf(g) === i), ['interior', 'surface_tangent']);
});

test('TC-MAINT-002 every canonical picking ray resolves to its expected slice through the viewer page, exactly', () => {
  const v = viewerWithBlob();
  const cohorts = { interior: [0, 0], surface_tangent: [0, 0] };
  for (const ray of CANONICAL.picking_rays) {
    const hit = v.api.pickRay(toVoxel(ray.origin_world), ray.direction_world.map((c, i) => c / SPACING[i]));
    assert.notEqual(hit, null, `${ray.id} ${ray.group}`);
    assert.equal(hit.slice, ray.expected_slice_index, `${ray.id} ${ray.group}`);
    cohorts[ray.group][0] += 1;
  }
  assert.deepEqual(cohorts, { interior: [5, 0], surface_tangent: [8, 0] }, 'both contractual cohorts are exercised: 5 interior and 8 surface-tangent rays');
  // a ray that misses the volume never names a slice (it is not clamped to the nearest one)
  assert.equal(v.api.pickRay(toVoxel([ORIGIN[0] - 50, ORIGIN[1], ORIGIN[2]]), [-1, 0, 0]), null);
});

test('TC-MAINT-002 points outside the volume name no slice: a miss for x or y, a refusal for z (never clamped)', () => {
  const v = viewerWithBlob();
  for (const p of CANONICAL.points.filter((q) => q.group === 'out_of_range')) {
    const [x, y, z] = p.voxel_xyz;
    assert.equal(p.in_range, false, p.id);
    if (x < 0 || x >= SHAPE[0] || y < 0 || y >= SHAPE[1]) {
      assert.equal(v.api.pickRay([x, y, SHAPE[2] + 5], [0, 0, -1]), null, `${p.id}: a ray down the column outside the volume hits nothing`);
    } else {
      // z outside: the page refuses a negative slice, and the app refuses a slice past the last one
      v.send({ type: 'slice', index: z });
      const page = v.api.state().slice;
      const app = Number.isInteger(page) ? selectionAfterPick({ kind: 'pick', role: 'prediction', triangle: null, slice: page }, SHAPE[2]) : null;
      assert.equal(page === null || app.slice === null, true, `${p.id}: z = ${z} is refused, not moved to the nearest slice`);
    }
  }
});

test('TC-MAINT-002 and TC-3D-003 a point\'s z falls in the slab of its floor slice, and in no other', () => {
  const v = viewerWithBlob();
  const inRange = CANONICAL.points.filter((p) => p.in_range);
  assert.equal(inRange.length, 27);
  let halfVoxel = 0;
  for (const p of inRange) {
    const z = p.voxel_xyz[2];
    const slice = Math.floor(z);
    // the fixture's own answer, where it gives one; the half-voxel group leaves it to the floor rule
    if (p.expected_slice_index !== null) assert.equal(slice, p.expected_slice_index, p.id);
    else halfVoxel += 1;
    v.send({ type: 'slice', index: z });                              // the app hands the page the point's z
    assert.equal(v.api.state().slice, slice, `${p.id}: z = ${z} floors to slice ${slice}, it is not rounded`);
    const [lo, hi] = v.api.bandRange();
    assert.ok(lo <= z && z < hi, `${p.id}: the band of slice ${slice} (z ${lo} to ${hi}) holds z = ${z}`);
    assert.ok(toWorldZ(lo) <= p.world_xyz[2] + 1e-9 && p.world_xyz[2] < toWorldZ(hi) + 1e-9, `${p.id}: and its world z ${p.world_xyz[2]} mm`);
    for (const other of [slice - 1, slice + 1]) {
      v.send({ type: 'slice', index: other });
      const [olo, ohi] = v.api.bandRange() || [0, 0];
      assert.equal(olo <= z && z < ohi, false, `${p.id}: the band of slice ${other} does not hold z = ${z}`);
    }
  }
  assert.equal(halfVoxel, 3, 'z = 3.5, 7.5 and 11.5: the points where floor and round-to-nearest disagree');
});

test('TC-3D-003 slice k moves the band to the slab z = k to k + 1 (and the cut plane to its top), for every slice of the fixture', () => {
  const v = viewerWithBlob();
  for (let k = 0; k < SHAPE[2]; k += 1) {
    v.send({ type: 'slice', index: k });
    assert.deepEqual([...v.api.bandRange()], [k, k + 1], `slice ${k}`);
    assert.deepEqual([toWorldZ(k), toWorldZ(k + 1)], [ORIGIN[2] + k * SPACING[2], ORIGIN[2] + (k + 1) * SPACING[2]], `slice ${k} in world z`);
    v.frame();
    const sent = v.glCalls.filter(([name]) => name === 'uniform2f').pop();
    assert.deepEqual([sent[2], sent[3]], [k, k + 1], `slice ${k}: the shader draws the band where the page says`);
  }
  v.send({ type: 'slice', index: 4 });
  v.press('cut');
  assert.equal(v.api.state().cut, 5, 'the cut keeps everything up to z = k + 1');
  for (const bad of [-1, null, 'x', NaN]) {
    v.send({ type: 'slice', index: bad });
    assert.equal(v.api.bandRange(), null, `${bad}: no slice, no band`);
    assert.equal(v.api.state().cut, null, `${bad}: and nothing is cut`);
  }
  // opened from a 2D slice: the band is there as soon as the app says which slice that is, and a pick replaces it
  const fresh = viewerWithBlob();
  fresh.send({ type: 'slice', index: 11 });
  assert.deepEqual([...fresh.api.bandRange()], [11, 12]);
  fresh.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  const top = fresh.api.pickRay([24.5, 20.5, 40], [0, 0, -1]);
  fresh.send({ type: 'slice', index: top.slice });
  assert.deepEqual([...fresh.api.bandRange()], [top.slice, top.slice + 1]);
});

// A point inside a face, never on an edge shared with its neighbour, so the face under a tap is unambiguous.
function faceCentroid(mesh, triangle) {
  const corners = mesh.triangles[triangle].map((i) => mesh.vertices[i]);
  return [0, 1, 2].map((axis) => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3);
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('TC-3D-004 after rotate, zoom and pan a tap on a visible face still names that face\'s source slice, exactly', () => {
  const v = viewerWithBlob();
  const cameras = [
    { name: 'default', yaw: -0.5, pitch: 0.35, zoom: 1, pan: [0, 0] },
    { name: 'rotated and zoomed in', yaw: 0.9, pitch: -0.4, zoom: 1.8, pan: [0.05, -0.04] },
    { name: 'turned right round, zoomed out', yaw: -2.4, pitch: 0.8, zoom: 0.6, pan: [-0.1, 0.1] },
    { name: 'close up from the side', yaw: 1.57, pitch: 0.1, zoom: 2.4, pan: [0, 0] },
    { name: 'from below, panned', yaw: 0.3, pitch: -1.2, zoom: 1.4, pan: [0.15, 0.05] },
  ];
  const samples = MESH.triangles.map((_, t) => t).filter((t) => t % 7 === 0);
  const perCamera = [];
  for (const cam of cameras) {
    v.api.setCamera({ yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom, pan: cam.pan });
    let verified = 0;
    for (const t of samples) {
      const point = faceCentroid(MESH, t);
      const screen = v.api.project(point);
      if (!screen || screen.x < 0 || screen.x > v.rect.width || screen.y < 0 || screen.y > v.rect.height) continue;   // off screen
      const ray = v.api.rayAt(screen.x, screen.y);
      const hit = v.api.pickRay(ray.origin, ray.direction);
      if (!hit || Math.abs(hit.distance - dist(ray.origin, point)) > 1e-3) continue;   // something nearer hides this face
      assert.equal(hit.triangle, t, `${cam.name}: triangle ${t}`);
      assert.equal(hit.slice, MESH.slices[t], `${cam.name}: triangle ${t} belongs to slice ${MESH.slices[t]}`);
      // and through the real tap path: the page posts the slice of the face under the finger
      v.tap(screen.x, screen.y);
      const picked = v.events('pick').pop();
      assert.deepEqual([picked.role, picked.triangle, picked.slice], ['prediction', t, MESH.slices[t]], `${cam.name}: tap on triangle ${t}`);
      assert.equal(v.api.state().slice, MESH.slices[t], 'the tapped slice becomes the band');
      verified += 1;
    }
    perCamera.push(verified);
  }
  assert.ok(perCamera.every((n) => n >= 8) && perCamera.reduce((a, b) => a + b) >= 300, `visible faces verified per camera: ${perCamera}`);
  // the canonical rays, taken through a camera that looks along each of them, resolve exactly as before
  const ray = CANONICAL.picking_rays[0];
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 2.5, pan: [0, 0] });
  const hit = v.api.pickRay(toVoxel(ray.origin_world), ray.direction_world.map((c, i) => c / SPACING[i]));
  assert.equal(hit.slice, ray.expected_slice_index, 'the camera does not enter the ray cast by world / voxel coordinates');
});
