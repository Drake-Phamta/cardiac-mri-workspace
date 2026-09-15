// OBJ parser for the subset emitted by mesh/build_mesh.py.
// Faces are triangulated and expanded with flat normals for the WebGL viewer.

export function parseObj(text) {
  const vertices = [];
  const positions = [];
  const normals = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const fields = line.split(/\s+/);
    if (fields[0] === 'v' && fields.length >= 4) {
      vertices.push([Number(fields[1]), Number(fields[2]), Number(fields[3])]);
    } else if (fields[0] === 'f' && fields.length >= 4) {
      const ids = fields.slice(1).map((token) => {
        const index = Number(token.split('/')[0]);
        if (!Number.isInteger(index) || index === 0) throw new Error(`bad OBJ face index: ${token}`);
        return index < 0 ? vertices.length + index : index - 1;
      });
      for (let i = 1; i + 1 < ids.length; i += 1) {
        const tri = [ids[0], ids[i], ids[i + 1]];
        const a = vertices[tri[0]], b = vertices[tri[1]], c = vertices[tri[2]];
        if (!a || !b || !c) throw new Error('OBJ face references a missing vertex');
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const length = Math.hypot(...n) || 1;
        for (const index of tri) {
          positions.push(...vertices[index]);
          normals.push(n[0] / length, n[1] / length, n[2] / length);
        }
      }
    }
  }
  if (positions.length === 0) throw new Error('OBJ contains no triangles');
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    triangles: positions.length / 9,
  };
}
