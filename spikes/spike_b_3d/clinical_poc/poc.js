const [meta, pixels, mask] = await Promise.all([
  fetch('poc-data/meta.json').then((response) => {
    if (!response.ok) throw new Error('Local POC data is missing; run build_poc_data.py first.');
    return response.json();
  }),
  fetch('poc-data/mri_u8_zyx.bin').then((response) => response.arrayBuffer()).then((buffer) => new Uint8Array(buffer)),
  fetch('poc-data/mask_u8_zyx.bin').then((response) => response.arrayBuffer()).then((buffer) => new Uint8Array(buffer)),
]);

const [nx, ny, nz] = meta.shape_xyz;
const downsample = meta.downsample_xyz;
const sourceSpacing = meta.source_spacing_xyz_mm;
const sourceOrigin = meta.source_origin_ras_mm;
const selected = [
  Math.round((meta.centroid_preview_xyz?.[0] ?? (nx - 1) / 2)),
  Math.round((meta.centroid_preview_xyz?.[1] ?? (ny - 1) / 2)),
  Math.round((meta.centroid_preview_xyz?.[2] ?? (nz - 1) / 2)),
];
const canvas = Object.fromEntries(['axial', 'coronal', 'sagittal'].map((id) => [id, document.querySelector(`#${id}`)]));
const sliders = ['x', 'y', 'z'].map((id) => document.querySelector(`#${id}`));
const index = (x, y, z) => z * ny * nx + y * nx + x;
const dimensions = [nx, ny, nz];
const clamp = (value, max) => Math.max(0, Math.min(max, value));
const pixel = (x, y, z) => pixels[index(x, y, z)];
const labelled = (x, y, z) => mask[index(x, y, z)] !== 0;

// RAS-oriented canonical volumes are shown in radiological screen convention.
// Signs describe which source voxel index appears at screen left/top.
const planes = {
  axial: { horizontal: 0, vertical: 1, horizontalSign: -1, verticalSign: -1,
    left: 'R', right: 'L', top: 'A', bottom: 'P', title: 'AXIAL · RAS XY' },
  coronal: { horizontal: 0, vertical: 2, horizontalSign: -1, verticalSign: -1,
    left: 'R', right: 'L', top: 'S', bottom: 'I', title: 'CORONAL · RAS XZ' },
  sagittal: { horizontal: 1, vertical: 2, horizontalSign: -1, verticalSign: -1,
    left: 'A', right: 'P', top: 'S', bottom: 'I', title: 'SAGITTAL · RAS YZ' },
};

function pointFor(name, horizontal, vertical) {
  const selectedPoint = [...selected];
  const plane = planes[name];
  selectedPoint[plane.horizontal] = horizontal;
  selectedPoint[plane.vertical] = vertical;
  return selectedPoint;
}

function sourceAt(name, horizontal, vertical) {
  const point = pointFor(name, horizontal, vertical);
  return point.map((value, axis) => value * downsample[axis]);
}

function fitRect(name, target) {
  const plane = planes[name];
  const horizontalCount = dimensions[plane.horizontal];
  const verticalCount = dimensions[plane.vertical];
  const spacing = meta.preview_spacing_xyz_mm;
  const physicalAspect = horizontalCount * spacing[plane.horizontal]
    / (verticalCount * spacing[plane.vertical]);
  const canvasAspect = target.width / target.height;
  const width = canvasAspect > physicalAspect ? target.height * physicalAspect : target.width;
  const height = width / physicalAspect;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2,
    width, height, horizontalCount, verticalCount };
}

function sampleIndex(displayIndex, count, sign) {
  return sign > 0 ? displayIndex : count - 1 - displayIndex;
}

function draw(name) {
  const target = canvas[name];
  const ctx = target.getContext('2d', { alpha: false });
  const image = ctx.createImageData(target.width, target.height);
  const { data } = image;
  const plane = planes[name];
  const box = fitRect(name, target);
  const [imageLo, imageHi] = meta.window_u8 ?? [0, 255];

  for (let row = 0; row < target.height; row += 1) {
    for (let col = 0; col < target.width; col += 1) {
      const at = (row * target.width + col) * 4;
      data[at] = data[at + 1] = data[at + 2] = 5;
      data[at + 3] = 255;
      if (col < box.x || col >= box.x + box.width || row < box.y || row >= box.y + box.height) continue;

      const screenCol = Math.min(box.horizontalCount - 1,
        Math.floor((col - box.x) * box.horizontalCount / box.width));
      const screenRow = Math.min(box.verticalCount - 1,
        Math.floor((row - box.y) * box.verticalCount / box.height));
      const horizontal = sampleIndex(screenCol, box.horizontalCount, plane.horizontalSign);
      const vertical = sampleIndex(screenRow, box.verticalCount, plane.verticalSign);
      const point = pointFor(name, horizontal, vertical);
      const [x, y, z] = point;
      const value = Math.round(255 * Math.max(0, Math.min(1,
        (pixel(x, y, z) - imageLo) / Math.max(1, imageHi - imageLo))));
      const hasMask = labelled(x, y, z);
      const edge = hasMask && (x === 0 || y === 0 || z === 0 || x + 1 === nx || y + 1 === ny || z + 1 === nz
        || !labelled(Math.max(0, x - 1), y, z) || !labelled(Math.min(nx - 1, x + 1), y, z)
        || !labelled(x, Math.max(0, y - 1), z) || !labelled(x, Math.min(ny - 1, y + 1), z)
        || !labelled(x, y, Math.max(0, z - 1)) || !labelled(x, y, Math.min(nz - 1, z + 1)));
      data[at] = hasMask ? Math.round(value * 0.44 + (edge ? 246 : 207) * 0.56) : value;
      data[at + 1] = hasMask ? Math.round(value * 0.38 + (edge ? 174 : 111) * 0.62) : value;
      data[at + 2] = hasMask ? Math.round(value * 0.32 + (edge ? 91 : 64) * 0.68) : value;
    }
  }
  ctx.putImageData(image, 0, 0);

  const horizontal = selected[plane.horizontal];
  const vertical = selected[plane.vertical];
  const screenCol = sampleIndex(horizontal, box.horizontalCount, plane.horizontalSign);
  const screenRow = sampleIndex(vertical, box.verticalCount, plane.verticalSign);
  const crossX = box.x + (screenCol + 0.5) * box.width / box.horizontalCount;
  const crossY = box.y + (screenRow + 0.5) * box.height / box.verticalCount;
  ctx.save();
  ctx.strokeStyle = 'rgba(88, 219, 232, 0.95)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(crossX, box.y); ctx.lineTo(crossX, box.y + box.height);
  ctx.moveTo(box.x, crossY); ctx.lineTo(box.x + box.width, crossY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#dce8ed';
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(plane.top, target.width / 2, Math.max(13, box.y - 7));
  ctx.fillText(plane.bottom, target.width / 2, Math.min(target.height - 4, box.y + box.height + 15));
  ctx.textAlign = 'left';
  ctx.fillText(plane.left, Math.max(4, box.x - 15), target.height / 2 + 4);
  ctx.textAlign = 'right';
  ctx.fillText(plane.right, Math.min(target.width - 4, box.x + box.width + 15), target.height / 2 + 4);
  ctx.restore();
}

function render() {
  Object.keys(canvas).forEach(draw);
  sliders.forEach((slider, axis) => { slider.value = selected[axis]; });
  const native = sourceAt('axial', selected[0], selected[1]);
  const ras = native.map((voxel, axis) => sourceOrigin[axis] + (voxel + 0.5) * sourceSpacing[axis]);
  const fixed = ras.map((value) => value.toFixed(1));
  document.querySelector('#coords').textContent = `RAS ${fixed.join(', ')} mm · source IJK ${native.join(', ')}`;
  document.querySelector('#segment-name').textContent = `${meta.segment} · label ${meta.label_value}`;
  document.querySelector('#segment-summary').textContent = `${meta.segment_voxels.toLocaleString()} voxels · ${meta.segment_volume_ml.toFixed(1)} mL label volume`;
  document.querySelector('#landmarks').textContent = `Missing labels: ${meta.landmarks_unavailable.join(' · ')}`;
  document.querySelector('#axial-position').textContent = `Z ${native[2]} · ${ras[2].toFixed(1)} mm`;
  document.querySelector('#coronal-position').textContent = `Y ${native[1]} · ${ras[1].toFixed(1)} mm`;
  document.querySelector('#sagittal-position').textContent = `X ${native[0]} · ${ras[0].toFixed(1)} mm`;
  const z = selected[2] * downsample[2];
  const worldZ = sourceOrigin[2] + (z + 0.5) * sourceSpacing[2];
  document.querySelector('#three').contentWindow?.postMessage({
    type: 'set-slice-world-z', z: worldZ, band_mm: sourceSpacing[2] * 0.9,
  }, window.location.origin);
}

function setFromPointer(name, event) {
  const target = canvas[name];
  const bounds = target.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * target.width / bounds.width;
  const y = (event.clientY - bounds.top) * target.height / bounds.height;
  const box = fitRect(name, target);
  if (x < box.x || x >= box.x + box.width || y < box.y || y >= box.y + box.height) return;
  const screenCol = Math.min(box.horizontalCount - 1,
    Math.floor((x - box.x) * box.horizontalCount / box.width));
  const screenRow = Math.min(box.verticalCount - 1,
    Math.floor((y - box.y) * box.verticalCount / box.height));
  const plane = planes[name];
  selected[plane.horizontal] = sampleIndex(screenCol, box.horizontalCount, plane.horizontalSign);
  selected[plane.vertical] = sampleIndex(screenRow, box.verticalCount, plane.verticalSign);
  render();
}

for (const [axis, slider] of sliders.entries()) {
  slider.min = '0';
  slider.max = String(dimensions[axis] - 1);
  slider.value = String(selected[axis]);
  slider.addEventListener('input', () => { selected[axis] = Number(slider.value); render(); });
}
for (const [name, target] of Object.entries(canvas)) {
  target.addEventListener('pointerdown', (event) => setFromPointer(name, event));
  target.addEventListener('pointermove', (event) => { if (event.buttons) setFromPointer(name, event); });
  target.addEventListener('wheel', (event) => {
    event.preventDefault();
    const axis = name === 'axial' ? 2 : name === 'coronal' ? 1 : 0;
    selected[axis] = clamp(selected[axis] + (event.deltaY > 0 ? 1 : -1), dimensions[axis] - 1);
    render();
  }, { passive: false });
}
document.querySelector('#three').addEventListener('load', render);
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.type !== 'select-source-slice' || !Number.isInteger(message.slice_index)) return;
  selected[2] = clamp(Math.floor(message.slice_index / downsample[2]), nz - 1);
  render();
});
window.addEventListener('resize', render);
render();
