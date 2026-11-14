// The edge of a 0/1 mask as one SVG path in source pixels, so SCR-06 can draw the source prediction as a line under
// the edits. An edge is a pixel side with foreground on one side and background (or the slice border) on the
// other. Sides along the same line are joined into one segment, so a filled square gives exactly its four sides and
// nothing inside it; a hole gives its own sides. Plain JS that Node tests import.

export function outlinePath(data, width, height) {
  // Work inside the foreground's bounding box only: the heart is a small part of the slice.
  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return '';

  const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] !== 0;
  const parts = [];
  // Top and bottom sides: along the line between row y - 1 and row y.
  for (let y = y0; y <= y1 + 1; y += 1) {
    let start = -1;
    for (let x = x0; x <= x1 + 1; x += 1) {
      const edge = x <= x1 && on(x, y - 1) !== on(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        parts.push(`M${start} ${y}h${x - start}`);
        start = -1;
      }
    }
  }
  // Left and right sides: down the line between column x - 1 and column x.
  for (let x = x0; x <= x1 + 1; x += 1) {
    let start = -1;
    for (let y = y0; y <= y1 + 1; y += 1) {
      const edge = y <= y1 && on(x - 1, y) !== on(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) {
        parts.push(`M${x} ${start}v${y - start}`);
        start = -1;
      }
    }
  }
  return parts.join('');
}
