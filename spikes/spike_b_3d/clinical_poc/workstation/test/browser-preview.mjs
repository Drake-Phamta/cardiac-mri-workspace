import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8773';
const shots = process.env.PREVIEW_SHOTS || '/tmp/cmw-workstation-shots';
const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
assert.ok(resolve(shots) !== resolve(repository) && !resolve(shots).startsWith(resolve(repository) + sep), 'Keep source-image screenshots outside Git');
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
const errors = []; page.on('pageerror', (error) => { errors.push(error.message); console.log('PAGE ERROR', error.message); });
page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); console.log('CONSOLE ERROR', message.text().slice(0, 1000)); } });
const ready = () => page.waitForFunction(() => document.getElementById('render-status').textContent.includes('ready'));
try {
  await page.goto(url); await page.waitForFunction(() => window.previewReady, { timeout: 120000 });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${shots}/combined.png` });
  console.log('READY', await page.locator('#render-status').innerText());

  // Anatomy is named only when the header or the operator verified it.
  const verified = await page.evaluate(() => window.previewDebug.verified);
  const titles = await page.locator('.pane-head b').allInnerTexts();
  const cameras = await page.locator('[data-camera]').allInnerTexts();
  if (verified) {
    assert.deepEqual(titles, ['AXIAL', 'CORONAL', 'SAGITTAL']); assert.ok(cameras.includes('Anterior'));
    assert.equal(await page.locator('#orientation-badge').isVisible(), false);
  } else {
    assert.ok(titles.every((title) => /^ARRAY [IJK]-PLANE$/.test(title)), titles.join());
    assert.ok(!cameras.some((name) => /Anterior|Posterior|Left|Right|Inferior/.test(name)), cameras.join());
    assert.equal(await page.locator('#orientation-badge').isVisible(), true);
    assert.match(await page.locator('#coords').innerText(), /orientation unverified/);
  }

  for (const key of ['voxel', 'flying', 'slicer', 'nets', 'gentle']) {
    await page.selectOption('#variant', key); await ready(); await page.waitForTimeout(250);
    assert.equal(await page.locator('#error').isVisible(), false);
  }
  await page.click('[data-mode="surface"]'); await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/surface.png` });
  await page.click('#fit');
  const projected = await page.evaluate(() => {
    const d = window.previewDebug;
    return d.worldToDisplay(d.meta.centroid_xyz.map((v, a) => v * d.meta.spacing_xyz_mm[a] + d.meta.origin_ras_mm[a]));
  });
  await page.mouse.click(...projected);
  assert.match(await page.locator('#pick-status').innerText(), /source IJK/);
  const picked = await page.evaluate(() => ({ ijk: [...window.previewDebug.state.selected], label: window.previewDebug.sourceVoxel(window.previewDebug.state.selected).label }));
  assert.equal(picked.label, 1);
  for (const [at, id] of ['x', 'y', 'z'].entries()) assert.equal(Number(await page.locator(`#${id}`).inputValue()), picked.ijk[at]);
  const stage = await page.locator('#stage').boundingBox();
  await page.mouse.click(stage.x + 40, stage.y + stage.height / 2); // a background ray must leave the source crosshair unchanged
  assert.deepEqual(await page.evaluate(() => [...window.previewDebug.state.selected]), picked.ijk);
  await page.check('#clip'); await page.waitForTimeout(250); await page.screenshot({ path: `${shots}/cut.png` }); await page.uncheck('#clip');
  await page.check('#planes'); await page.waitForTimeout(250); await page.screenshot({ path: `${shots}/planes.png` }); await page.uncheck('#planes');
  const correspondence = await page.evaluate(() => {
    const d = window.previewDebug, shape = d.meta.shape_xyz;
    let ijk;
    outer: for (let z = 0; z < shape[2]; z++) for (let y = 0; y < shape[1]; y++) for (let x = 0; x < shape[0]; x++) if (d.sourceVoxel([x, y, z]).label === 1) { ijk = [x, y, z]; break outer; }
    const world = ijk.map((v, a) => d.meta.origin_ras_mm[a] + v * d.meta.spacing_xyz_mm[a]);
    const result = d.resolve(world, 1); const before = [...d.state.selected]; const miss = d.resolve([-10000, -10000, -10000], 1);
    return { target: ijk, result: result.ijk, before, after: [...d.state.selected], miss };
  });
  assert.deepEqual(correspondence.result, correspondence.target); assert.deepEqual(correspondence.after, correspondence.before); assert.equal(correspondence.miss, null);

  // MPR: the label ROI is framed by default, zoom keeps picks on source voxels.
  assert.match(await page.locator('#axial-pos').innerText(), /×\d/);
  const axial = await page.locator('#axial').boundingBox();
  await page.mouse.move(axial.x + axial.width / 2, axial.y + axial.height / 2);
  const zoomBefore = await page.locator('#axial-pos').innerText();
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -240); await page.keyboard.up('Control'); await page.waitForTimeout(150);
  assert.notEqual(await page.locator('#axial-pos').innerText(), zoomBefore);
  const fixedZ = picked.ijk[2];
  await page.evaluate((z) => { const s = document.getElementById('z'); s.value = z; s.dispatchEvent(new Event('input')); }, fixedZ);
  await page.mouse.click(axial.x + axial.width / 2, axial.y + axial.height / 2);
  const afterClick = await page.evaluate(() => [...window.previewDebug.state.selected]);
  assert.equal(afterClick[2], fixedZ, 'an in-plane click never changes the axial slice');
  await page.screenshot({ path: `${shots}/mpr-zoom.png` });

  for (const mode of ['mip', 'volume']) {
    await page.click(`[data-mode="${mode}"]`); await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${mode}.png` });
    assert.equal(await page.locator('#threshold').isDisabled(), mode === 'mip');
  }
  await page.uncheck('[data-label="1"]'); await page.click('[data-mode="surface"]');
  const beforeHidden = await page.evaluate(() => [...window.previewDebug.state.selected]);
  await page.mouse.click(...projected);
  assert.deepEqual(await page.evaluate(() => [...window.previewDebug.state.selected]), beforeHidden);
  await page.click('#fit'); // no visible label: framing falls back to the MRI ROI instead of NaN bounds
  assert.equal(await page.evaluate(() => window.previewDebug.getSurfaceBounds().length), 1);
  await page.check('[data-label="1"]');
  // Showing the label again must not leave it cut by a clipping range fitted without it.
  const range = await page.evaluate(() => window.previewDebug.clippingCoversSurfaces());
  assert.ok(range.covers, JSON.stringify(range));

  // Shrinking the window must not leave panes overflowing under the footer.
  for (const [width, height] of [[1280, 800], [1100, 900], [700, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(400);
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth,
      clipped: [...document.querySelectorAll('.mpr, .scene-panel')].some((el) => el.getBoundingClientRect().bottom > document.querySelector('footer').getBoundingClientRect().top + 1) }));
    assert.deepEqual(layout, { overflow: false, clipped: false }, `layout at ${width}px`);
    await page.screenshot({ path: `${shots}/w${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(`PASS (${verified ? 'verified' : 'unverified'} orientation): five surface variants, four display modes, clipping, MRI planes, real canvas picking, missed/hidden-label rays, MPR zoom and responsive layout`);
} finally { await browser.close(); }
