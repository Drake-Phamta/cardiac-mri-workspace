import { nativeVoxel, voxelWorld } from './geometry.mjs';
import { axisName, canvasToSlice, fullView, panBy, paneBox, planeLayout, roiView, scaleBarMm, sliceToCanvas, zoomAt } from './mprMath.mjs';

const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const ARIA = { axial: 'Axial', coronal: 'Coronal', sagittal: 'Sagittal' };

export function createMpr(meta, image, labels, state, onSelect, verified) {
  const shape = meta.shape_xyz, spacing = meta.spacing_xyz_mm, strides = [1, shape[0], shape[0] * shape[1]];
  const selected = state.selected, layout = planeLayout(verified);
  const colours = new Map(meta.segments.map((s) => [s.id, rgb(s.color)]));
  const roi = [meta.volume.crop_source_min_xyz, meta.volume.crop_source_max_exclusive_xyz];
  const panes = Object.fromEntries(Object.entries(layout).map(([name, plane]) => [name, {
    name, plane, canvas: document.getElementById(name), off: document.createElement('canvas'), key: '', view: null, roi: true,
  }]));
  const geometry = (pane) => ({ width: pane.canvas.width, height: pane.canvas.height, margin: 15 * (window.devicePixelRatio || 1) });
  const defaultView = (pane) => (pane.roi ? roiView(pane.plane, shape, spacing, geometry(pane), ...roi) : fullView());

  // The slice bitmap depends only on its fixed index and display settings;
  // crosshair moves, zoom and pan reuse it.
  function sliceBitmap(pane) {
    const { plane, off } = pane, h = plane.horizontal, v = plane.vertical, f = plane.fixed;
    const key = `${selected[f]}|${state.window}|${state.overlay}|${[...state.visible]}`;
    if (key === pane.key) return off;
    const columns = shape[h], rows = shape[v], sh = strides[h], sv = strides[v], base = selected[f] * strides[f];
    if (off.width !== columns || off.height !== rows) { off.width = columns; off.height = rows; }
    const context = off.getContext('2d'), pixels = context.createImageData(columns, rows), data = pixels.data;
    const [low, high] = state.window, scale = 255 / Math.max(1e-6, high - low);
    for (let row = 0; row < rows; row += 1) {
      const iv = plane.vSign > 0 ? row : rows - 1 - row;
      for (let column = 0; column < columns; column += 1) {
        const ih = plane.hSign > 0 ? column : columns - 1 - column, index = base + ih * sh + iv * sv, at = (row * columns + column) * 4;
        let gray = (image[index] - low) * scale; gray = gray < 0 ? 0 : gray > 255 ? 255 : gray;
        let r = gray, g = gray, b = gray;
        const id = labels[index], colour = id && state.overlay && state.visible.has(id) ? colours.get(id) : undefined;
        if (colour) {
          const edge = ih === 0 || iv === 0 || ih === columns - 1 || iv === rows - 1
            || labels[index - sh] !== id || labels[index + sh] !== id || labels[index - sv] !== id || labels[index + sv] !== id;
          const alpha = edge ? 0.85 : 0.22;
          r = gray * (1 - alpha) + colour[0] * alpha; g = gray * (1 - alpha) + colour[1] * alpha; b = gray * (1 - alpha) + colour[2] * alpha;
        }
        data[at] = r; data[at + 1] = g; data[at + 2] = b; data[at + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0); pane.key = key; return off;
  }

  function draw(pane) {
    const { canvas, plane } = pane, dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    if (!pane.view && width > 1 && height > 1) pane.view = defaultView(pane);
    const view = pane.view || fullView(), pane2d = geometry(pane), box = paneBox(plane, shape, spacing, pane2d, view);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#020508'; ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(sliceBitmap(pane), box.x, box.y, box.width, box.height);
    const [cx, cy] = sliceToCanvas(plane, shape, spacing, pane2d, view, selected);
    const left = Math.max(0, box.x), right = Math.min(width, box.x + box.width), top = Math.max(0, box.y), bottom = Math.min(height, box.y + box.height);
    ctx.strokeStyle = '#88d3d4c0'; ctx.lineWidth = dpr * 0.8; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath();
    if (cx >= left && cx <= right) { ctx.moveTo(cx, top); ctx.lineTo(cx, bottom); }
    if (cy >= top && cy <= bottom) { ctx.moveTo(left, cy); ctx.lineTo(right, cy); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#c3d3dd'; ctx.font = `600 ${10 * dpr}px ui-monospace,monospace`; ctx.textBaseline = 'middle';
    ctx.textAlign = 'center'; ctx.fillText(plane.top, width / 2, 8 * dpr); ctx.fillText(plane.bottom, width / 2, height - 8 * dpr);
    ctx.textAlign = 'left'; ctx.fillText(plane.left, 4 * dpr, height / 2);
    ctx.textAlign = 'right'; ctx.fillText(plane.right, width - 4 * dpr, height / 2);
    const pixelsPerMm = box.width / box.columns / spacing[plane.horizontal], mm = scaleBarMm(pixelsPerMm, 28 * dpr, 110 * dpr);
    const barX = 10 * dpr, barY = height - 10 * dpr;
    ctx.strokeStyle = '#a7c3d0'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(barX, barY); ctx.lineTo(barX + mm * pixelsPerMm, barY); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = `${8 * dpr}px ui-monospace,monospace`; ctx.fillText(`${mm} mm`, barX, barY - 4 * dpr);
    const world = voxelWorld(selected, meta), zoom = view.zoom >= 1.05 ? ` · ×${view.zoom.toFixed(1)}` : '';
    document.getElementById(`${pane.name}-pos`).textContent = `${axisName(verified, plane.fixed)} ${selected[plane.fixed]} · ${world[plane.fixed].toFixed(1)} mm${zoom}`;
  }

  function render() {
    Object.values(panes).forEach(draw);
    ['x', 'y', 'z'].forEach((name, axis) => { document.getElementById(name).value = selected[axis]; });
    const world = voxelWorld(selected, meta).map((v) => v.toFixed(2)).join(', ');
    document.getElementById('coords').textContent = verified ? `RAS ${world} mm\nIJK ${selected.join(', ')}` : `Array mm ${world}\nIJK ${selected.join(', ')} · orientation unverified`;
    document.getElementById('native-coords').textContent = `Native file IJK ${nativeVoxel(selected, meta.canonical_to_native_voxel).map((v) => v.toFixed(0)).join(', ')}`;
  }

  for (const pane of Object.values(panes)) {
    const { canvas, plane } = pane;
    document.getElementById(`${pane.name}-title`).textContent = plane.title;
    let gesture = null, wheel = 0;
    const local = (event) => { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height]; };
    const pick = (event) => {
      const hit = pane.view && canvasToSlice(plane, shape, spacing, geometry(pane), pane.view, ...local(event));
      if (!hit) return;
      [selected[plane.horizontal], selected[plane.vertical]] = hit; onSelect();
    };
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      gesture = event.button === 0 && !event.shiftKey ? 'pick' : 'pan';
      gesture === 'pick' ? pick(event) : (gesture = { last: local(event) });
    });
    canvas.addEventListener('pointermove', (event) => {
      if (gesture === 'pick') pick(event);
      else if (gesture && pane.view) {
        const point = local(event);
        pane.view = panBy(plane, shape, spacing, geometry(pane), pane.view, point[0] - gesture.last[0], point[1] - gesture.last[1]);
        gesture.last = point; draw(pane);
      }
    });
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { gesture = null; });
    canvas.addEventListener('dblclick', () => { pane.roi = !pane.roi; pane.view = defaultView(pane); draw(pane); });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) { // trackpad pinch arrives as ctrl+wheel
        if (!pane.view) return;
        pane.view = zoomAt(plane, shape, spacing, geometry(pane), pane.view, Math.exp(-event.deltaY * 0.004), ...local(event));
        draw(pane); return;
      }
      // One mouse notch = one slice; trackpad deltas accumulate instead of racing.
      const delta = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaMode === 2 ? event.deltaY * 800 : event.deltaY;
      let steps;
      if (Math.abs(delta) >= 50) { steps = Math.sign(delta); wheel = 0; } else { wheel += delta; steps = Math.trunc(wheel / 30); wheel -= steps * 30; }
      if (!steps) return;
      const axis = plane.fixed;
      selected[axis] = Math.max(0, Math.min(shape[axis] - 1, selected[axis] + steps)); onSelect();
    }, { passive: false });
  }
  ['x', 'y', 'z'].forEach((name, axis) => {
    const slider = document.getElementById(name); slider.min = 0; slider.max = shape[axis] - 1;
    const owner = Object.values(panes).find((pane) => pane.plane.fixed === axis);
    slider.setAttribute('aria-label', verified ? `${ARIA[owner.name]} source slice` : `Array ${axisName(false, axis)} slice`);
    slider.addEventListener('input', () => { selected[axis] = Number(slider.value); onSelect(); });
  });
  return { render };
}
