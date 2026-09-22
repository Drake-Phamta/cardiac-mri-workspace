// OBJ parser for the subset emitted by mesh/build_mesh.py.
// Faces are triangulated and expanded for the WebGL viewer. The default stays
// flat so the voxel-face picking artifact exposes its actual cell boundaries;
// a visual-only Marching Cubes preview may request averaged vertex normals.

export function parseObj(text, { smoothNormals = false } = {}) {
  const vertices = [];
  const triangles = [];
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
        triangles.push([ids[0], ids[i], ids[i + 1]]);
      }
    }
  }
  if (triangles.length === 0) throw new Error('OBJ contains no triangles');

  const accumulated = smoothNormals
    ? vertices.map(() => [0, 0, 0])
    : null;
  const faceNormal = (tri) => {
    const a = vertices[tri[0]], b = vertices[tri[1]], c = vertices[tri[2]];
    if (!a || !b || !c) throw new Error('OBJ face references a missing vertex');
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
  };
  if (accumulated) {
    for (const tri of triangles) {
      const normal = faceNormal(tri);
      for (const index of tri) {
        accumulated[index][0] += normal[0];
        accumulated[index][1] += normal[1];
        accumulated[index][2] += normal[2];
      }
    }
  }
  for (const tri of triangles) {
    const normal = faceNormal(tri);
    const length = Math.hypot(...normal) || 1;
    for (const index of tri) {
      const selected = accumulated ? accumulated[index] : normal;
      const selectedLength = Math.hypot(...selected) || length;
      positions.push(...vertices[index]);
      normals.push(
        selected[0] / selectedLength,
        selected[1] / selectedLength,
        selected[2] / selectedLength,
      );
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    triangles: positions.length / 9,
  };
}
