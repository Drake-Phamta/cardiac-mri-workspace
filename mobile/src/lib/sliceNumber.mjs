/*
 * The one way the app numbers a slice for people: 1-based, "45 / 88" for z = 44 of 88 slices. SCR-03 and SCR-04
 * use it, and SCR-06 can import it from here (screen folders do not import each other). The 0-based z the API
 * uses is not a number for people: it goes to the Details sheet only, with sliceDetail().
 */

const known = (z, total) => Number.isInteger(z) && z >= 0 && Number.isInteger(total) && total > 0 && z < total;

// The two numbers of the readout, as strings: { current: '45', total: '88', text: '45 / 88' }. A slice that is not
// known yet reads '-', never 0.
export function sliceParts(sliceIndex, total) {
  const all = Number.isInteger(total) && total > 0 ? String(total) : '-';
  const current = known(sliceIndex, total) ? String(sliceIndex + 1) : '-';
  return Object.freeze({ current, total: all, text: `${current} / ${all}` });
}

// "45 / 88".
export function formatSlice(sliceIndex, total) {
  return sliceParts(sliceIndex, total).text;
}

// The Details line: "Slice 45 / 88 · z 44" (the z is what the server's ids and logs use).
export function sliceDetail(sliceIndex, total) {
  const p = sliceParts(sliceIndex, total);
  return known(sliceIndex, total) ? `Slice ${p.text} · z ${sliceIndex}` : `Slice ${p.text}`;
}
