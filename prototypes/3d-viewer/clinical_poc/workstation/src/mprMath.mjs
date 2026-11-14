// DOM-free MPR geometry: plane naming, zoom/pan and canvas <-> voxel mapping.
// A view is { zoom, u, v }: zoom relative to fitting the whole slice, and the
// slice fraction (0..1, display orientation) that sits at the pane centre.

// Radiological convention for a verified RAS grid: patient right on screen
// left, anterior/superior at the top.
const ANATOMICAL = {
  axial: { title: 'AXIAL', horizontal: 0, vertical: 1, fixed: 2, hSign: -1, vSign: -1, left: 'R', right: 'L', top: 'A', bottom: 'P' },
  coronal: { title: 'CORONAL', horizontal: 0, vertical: 2, fixed: 1, hSign: -1, vSign: -1, left: 'R', right: 'L', top: 'S', bottom: 'I' },
  sagittal: { title: 'SAGITTAL', horizontal: 1, vertical: 2, fixed: 0, hSign: -1, vSign: -1, left: 'A', right: 'P', top: 'S', bottom: 'I' },
};
const AXIS = ['i', 'j', 'k'];
// Without a verified orientation only array axes can be named. Indices grow
// rightwards and upwards; "+" marks the higher-index edge.
function arrayPlane({ horizontal, vertical, fixed }) {
  return { title: `ARRAY ${AXIS[fixed].toUpperCase()}-PLANE`, horizontal, vertical, fixed, hSign: 1, vSign: -1,
    left: '', right: `+${AXIS[horizontal]}`, top: `+${AXIS[vertical]}`, bottom: '' };
}
export function planeLayout(verified) {
  return Object.fromEntries(Object.entries(ANATOMICAL).map(([name, plane]) => [name, verified ? { ...plane } : arrayPlane(plane)]));
}
export const axisName = (verified, axis) => (verified ? 'XYZ' : 'ijk')[axis];

const displayIndex = (index, count, sign) => (sign > 0 ? index : count - 1 - index);

function baseSize(plane, shape, spacing, pane) {
  const margin = pane.margin || 0, columns = shape[plane.horizontal], rows = shape[plane.vertical];
  const aspect = columns * spacing[plane.horizontal] / (rows * spacing[plane.vertical]);
  const width = Math.max(1, Math.min(pane.width - 2 * margin, (pane.height - 2 * margin) * aspect));
  return { width, height: width / aspect, columns, rows };
}
export function paneBox(plane, shape, spacing, pane, view) {
  const base = baseSize(plane, shape, spacing, pane), width = base.width * view.zoom, height = base.height * view.zoom;
  return { x: pane.width / 2 - view.u * width, y: pane.height / 2 - view.v * height, width, height, columns: base.columns, rows: base.rows };
}
export function sliceToCanvas(plane, shape, spacing, pane, view, ijk) {
  const box = paneBox(plane, shape, spacing, pane, view);
  return [box.x + (displayIndex(ijk[plane.horizontal], box.columns, plane.hSign) + 0.5) * box.width / box.columns,
    box.y + (displayIndex(ijk[plane.vertical], box.rows, plane.vSign) + 0.5) * box.height / box.rows];
}
/** Canvas pixel -> [horizontal, vertical] source indices, or null outside the slice. */
export function canvasToSlice(plane, shape, spacing, pane, view, x, y) {
  const box = paneBox(plane, shape, spacing, pane, view);
  const column = Math.floor((x - box.x) / box.width * box.columns), row = Math.floor((y - box.y) / box.height * box.rows);
  if (column < 0 || column >= box.columns || row < 0 || row >= box.rows) return null;
  return [displayIndex(column, box.columns, plane.hSign), displayIndex(row, box.rows, plane.vSign)];
}
export const clampView = ({ zoom, u, v }) => ({ zoom: Math.max(0.5, Math.min(40, zoom)), u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) });
export const fullView = () => ({ zoom: 1, u: 0.5, v: 0.5 });
/** Frame a source-index box [min, maxExclusive) such as the labelled ROI. */
export function roiView(plane, shape, spacing, pane, min, maxExclusive) {
  const base = baseSize(plane, shape, spacing, pane), margin = pane.margin || 0;
  const range = (axis, sign) => {
    const count = shape[axis], low = sign > 0 ? min[axis] : count - maxExclusive[axis], high = sign > 0 ? maxExclusive[axis] : count - min[axis];
    return [Math.max(0, low) / count, Math.min(count, high) / count];
  };
  const [u0, u1] = range(plane.horizontal, plane.hSign), [v0, v1] = range(plane.vertical, plane.vSign);
  const zoom = Math.min((pane.width - 2 * margin) / (base.width * Math.max(u1 - u0, 1e-6)), (pane.height - 2 * margin) / (base.height * Math.max(v1 - v0, 1e-6)));
  return clampView({ zoom: Math.max(1, zoom), u: (u0 + u1) / 2, v: (v0 + v1) / 2 });
}
/** Zoom by `factor` keeping the slice point under canvas (x, y) fixed. */
export function zoomAt(plane, shape, spacing, pane, view, factor, x, y) {
  const box = paneBox(plane, shape, spacing, pane, view), fu = (x - box.x) / box.width, fv = (y - box.y) / box.height;
  const zoom = Math.max(0.5, Math.min(40, view.zoom * factor)), next = paneBox(plane, shape, spacing, pane, { zoom, u: 0, v: 0 });
  return clampView({ zoom, u: (pane.width / 2 - x) / next.width + fu, v: (pane.height / 2 - y) / next.height + fv });
}
export function panBy(plane, shape, spacing, pane, view, dx, dy) {
  const box = paneBox(plane, shape, spacing, pane, view);
  return clampView({ zoom: view.zoom, u: view.u - dx / box.width, v: view.v - dy / box.height });
}
/** A round scale-bar length that renders between `minPx` and `maxPx`. */
export function scaleBarMm(pixelsPerMm, minPx, maxPx) {
  const choices = [1, 2, 5, 10, 20, 50, 100, 200];
  return choices.find((mm) => mm * pixelsPerMm >= minPx && mm * pixelsPerMm <= maxPx)
    ?? choices.reduce((best, mm) => (Math.abs(mm * pixelsPerMm - minPx) < Math.abs(best * pixelsPerMm - minPx) ? mm : best));
}
