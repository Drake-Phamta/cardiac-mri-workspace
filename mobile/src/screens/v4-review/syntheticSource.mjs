/*
 * FIXTURE MODE ONLY — a synthetic stand-in source mask for SCR-06.
 *
 * The generated fixture bundle carries metadata and checksums, never pixels:
 * mask bytes live at content_url (contract v1.0 binary_delivery), and in
 * fixture mode there is no server behind that URL. The brush still needs
 * something to edit so add / erase / undo / redo / reset / save can be shown on
 * a phone, so fixture mode draws THIS: a lobed blob, largest on the middle
 * slice and absent outside the middle third of the volume.
 *
 * It is not a prediction and not patient data. The screen labels it SYNTHETIC,
 * the brush session carries source.synthetic = true, and the V4 model refuses
 * to send a synthetic session to any transport but the fixture one.
 *
 * Deterministic: the same (nx, ny, z, nz) always gives the same bytes, so the
 * demo and the tests see the same mask.
 */

export function syntheticSourceSlice(nx, ny, z, nz) {
  const out = new Uint8Array(nx * ny);
  const centre = (nz - 1) / 2;
  const d = Math.abs(z - centre) / (nz / 3);
  if (!(d < 1)) return out;
  const scale = Math.sqrt(1 - d * d);
  const cx = nx * 0.52;
  const cy = ny * 0.48;
  const rx = nx * 0.11 * scale;
  const ry = ny * 0.085 * scale;
  const x0 = Math.max(0, Math.floor(cx - rx * 1.2));
  const x1 = Math.min(nx - 1, Math.ceil(cx + rx * 1.2));
  const y0 = Math.max(0, Math.floor(cy - ry * 1.2));
  const y1 = Math.min(ny - 1, Math.ceil(cy + ry * 1.2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      // An ellipse with three gentle lobes, so both add and erase have an
      // obvious edge to work on.
      if (dx * dx + dy * dy <= 1 + 0.12 * Math.cos(3 * Math.atan2(dy, dx))) out[y * nx + x] = 1;
    }
  }
  return out;
}
