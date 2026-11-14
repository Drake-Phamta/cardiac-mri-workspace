const [meta, pixels, mask] = await Promise.all([
  fetch('poc-data/meta.json').then(r => r.json()),
  fetch('poc-data/mri_u8_zyx.bin').then(r => r.arrayBuffer()).then(b => new Uint8Array(b)),
  fetch('poc-data/mask_u8_zyx.bin').then(r => r.arrayBuffer()).then(b => new Uint8Array(b)),
]);
const [nx, ny, nz] = meta.shape_xyz;
const selected = [Math.floor(nx / 2), Math.floor(ny / 2), Math.floor(nz / 2)];
const canvas = Object.fromEntries(['axial', 'coronal', 'sagittal'].map(id => [id, document.querySelector(`#${id}`)]));
const sliders = ['x', 'y', 'z'].map(id => document.querySelector(`#${id}`));
const index = (x, y, z) => z * ny * nx + y * nx + x;
const clamp = (value, max) => Math.max(0, Math.min(max, value));
const pixel = (x, y, z) => pixels[index(x, y, z)];
const labelled = (x, y, z) => mask[index(x, y, z)] !== 0;

for (const [axis, slider] of sliders.entries()) {
  slider.min = 0; slider.max = [nx - 1, ny - 1, nz - 1][axis]; slider.value = selected[axis];
  slider.addEventListener('input', () => { selected[axis] = Number(slider.value); render(); });
}

function draw(name) {
  const target = canvas[name]; const ctx = target.getContext('2d');
  const image = ctx.createImageData(target.width, target.height); const { data } = image;
  const [sourceWidth, sourceHeight] = name === 'axial' ? [nx, ny]
    : name === 'coronal' ? [nx, nz] : [ny, nz];
  for (let row = 0; row < target.height; row += 1) for (let col = 0; col < target.width; col += 1) {
    let x, y, z;
    const sampleCol = Math.floor(col * sourceWidth / target.width);
    const sampleRow = Math.floor(row * sourceHeight / target.height);
    if (name === 'axial') [x, y, z] = [sampleCol, sampleRow, selected[2]];
    if (name === 'coronal') [x, y, z] = [sampleCol, selected[1], sampleRow];
    if (name === 'sagittal') [x, y, z] = [selected[0], sampleCol, sampleRow];
    const at = (row * target.width + col) * 4; const value = pixel(x, y, z); const hasMask = labelled(x, y, z);
    data[at] = hasMask ? Math.round(value * .55 + 115) : value;
    data[at + 1] = hasMask ? Math.round(value * .35 + 55) : value;
    data[at + 2] = hasMask ? Math.round(value * .10) : value;
    data[at + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const [vx, vy] = name === 'axial' ? [selected[0], selected[1]] : name === 'coronal' ? [selected[0], selected[2]] : [selected[1], selected[2]];
  ctx.strokeStyle = '#63e0eb'; ctx.lineWidth = 1;
  const screenX = vx * target.width / sourceWidth;
  const screenY = vy * target.height / sourceHeight;
  ctx.beginPath(); ctx.moveTo(screenX + .5, 0); ctx.lineTo(screenX + .5, target.height); ctx.moveTo(0, screenY + .5); ctx.lineTo(target.width, screenY + .5); ctx.stroke();
}
function render() {
  Object.keys(canvas).forEach(draw); sliders.forEach((slider, axis) => { slider.value = selected[axis]; });
  const native = selected.map((v, axis) => v * meta.downsample_xyz[axis]);
  document.querySelector('#coords').textContent = `voxel ${native.join(', ')} · selected slice Z ${native[2]}`;
  document.querySelector('#landmarks').textContent = `not supplied: ${meta.landmarks_unavailable.join(', ')}`;
  const worldZ = meta.mesh_origin_world_mm[2] + native[2] * meta.source_spacing_xyz_mm[2];
  document.querySelector('#three').contentWindow?.postMessage({ type: 'set-slice-world-z', z: worldZ }, '*');
}
function setFromPointer(name, event) {
  const target = canvas[name]; const box = target.getBoundingClientRect();
  const [sourceWidth, sourceHeight] = name === 'axial' ? [nx, ny]
    : name === 'coronal' ? [nx, nz] : [ny, nz];
  const col = clamp(Math.floor((event.clientX - box.left) * sourceWidth / box.width), sourceWidth - 1);
  const row = clamp(Math.floor((event.clientY - box.top) * sourceHeight / box.height), sourceHeight - 1);
  if (name === 'axial') [selected[0], selected[1]] = [col, row];
  if (name === 'coronal') [selected[0], selected[2]] = [col, row];
  if (name === 'sagittal') [selected[1], selected[2]] = [col, row];
  render();
}
for (const [name, target] of Object.entries(canvas)) {
  target.addEventListener('pointerdown', event => setFromPointer(name, event));
  target.addEventListener('pointermove', event => { if (event.buttons) setFromPointer(name, event); });
  target.addEventListener('wheel', event => {
    event.preventDefault(); const axis = name === 'axial' ? 2 : name === 'coronal' ? 1 : 0;
    selected[axis] = clamp(selected[axis] + (event.deltaY > 0 ? 1 : -1), [nx - 1, ny - 1, nz - 1][axis]); render();
  }, { passive: false });
}
document.querySelector('#three').addEventListener('load', render);
render();
