import { parseObj } from './obj.js';
import { invertMat4, multiplyMat4, rayMeshFirstHit, screenRayFromNdc } from './picking.js';
import { nearestLabeledVoxel } from './viewer_math.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#gl');
const status = $('#status');
const pickLabel = $('#pick');
const meshInfo = $('#mesh-info');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
if (!gl) throw new Error('This POC needs WebGL2.');

const VOLUME_VERTEX = `#version 300 es
in vec3 aPosition;
in vec3 aTexCoord;
uniform mat4 uMvp;
out vec3 vLocal;
out vec3 vTex;
void main() { vLocal = aPosition; vTex = aTexCoord; gl_Position = uMvp * vec4(aPosition, 1.0); }`;
const VOLUME_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec3 vLocal;
uniform sampler3D uVolume;
uniform sampler2D uColorTf;
uniform sampler2D uOpacityTf;
uniform vec3 uCameraLocal;
uniform vec3 uLightDirection;
uniform vec3 uSpacing;
uniform vec3 uShape;
uniform float uStepMm;
uniform float uReferenceStepMm;
uniform float uOpacity;
uniform float uJitter;
uniform float uWindowLow;
uniform float uWindowHigh;
out vec4 outColor;
float sampleTextureIntensity(vec3 texCoord) {
  // RG8 stores the high/low bytes of a normalized uint16 sample. Recombine
  // after linear texture filtering so scalar interpolation remains linear.
  vec2 bytes = texture(uVolume, texCoord).rg;
  return bytes.r * (256.0 / 257.0) + bytes.g * (1.0 / 257.0);
}
float hashPixel(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float sampleIntensity(vec3 point) {
  vec3 voxel = point / uSpacing + (uShape - vec3(1.0)) * 0.5;
  vec3 texCoord = (voxel + vec3(0.5)) / uShape;
  return sampleTextureIntensity(texCoord);
}
vec3 estimateGradient(vec3 point) {
  vec3 voxelStep = vec3(1.0) / uShape;
  vec3 voxel = point / uSpacing + (uShape - vec3(1.0)) * 0.5;
  vec3 texCoord = (voxel + vec3(0.5)) / uShape;
  float gx = sampleTextureIntensity(texCoord + vec3(voxelStep.x, 0.0, 0.0))
           - sampleTextureIntensity(texCoord - vec3(voxelStep.x, 0.0, 0.0));
  float gy = sampleTextureIntensity(texCoord + vec3(0.0, voxelStep.y, 0.0))
           - sampleTextureIntensity(texCoord - vec3(0.0, voxelStep.y, 0.0));
  float gz = sampleTextureIntensity(texCoord + vec3(0.0, 0.0, voxelStep.z))
           - sampleTextureIntensity(texCoord - vec3(0.0, 0.0, voxelStep.z));
  return vec3(gx / (2.0 * uSpacing.x), gy / (2.0 * uSpacing.y), gz / (2.0 * uSpacing.z));
}
void main() {
  // The front face is the ray entry point. March toward the far side, as in VTK.
  if (!gl_FrontFacing) discard;
  vec3 ray = normalize(vLocal - uCameraLocal);
  vec3 point = vLocal + ray * (hashPixel(gl_FragCoord.xy) * uStepMm * uJitter);
  vec3 accumulated = vec3(0.0);
  float remainingTransmittance = 1.0;
  for (int i = 0; i < 512; ++i) {
    vec3 voxel = point / uSpacing + (uShape - vec3(1.0)) * 0.5;
    vec3 texCoord = (voxel + vec3(0.5)) / uShape;
    if (any(lessThan(texCoord, vec3(0.0))) || any(greaterThan(texCoord, vec3(1.0)))) break;
    float intensity = sampleIntensity(point);
    float windowedIntensity = clamp((intensity - uWindowLow) / max(uWindowHigh - uWindowLow, 0.001), 0.0, 1.0);
    float referenceOpacity = texture(uOpacityTf, vec2(windowedIntensity, 0.5)).r;
    // Preserve a transfer function's meaning if the physical ray step changes.
    float alpha = 1.0 - pow(max(1.0 - referenceOpacity, 0.0), (uStepMm / uReferenceStepMm) * uOpacity);
    if (alpha > 0.0001) {
      vec3 color = texture(uColorTf, vec2(windowedIntensity, 0.5)).rgb;
      vec3 gradient = estimateGradient(point);
      float gradientLength = length(gradient);
      if (gradientLength > 1e-6) {
        vec3 normal = gradient / gradientLength;
        if (dot(normal, uLightDirection) < 0.0) normal = -normal;
        float diffuse = max(dot(normal, uLightDirection), 0.0);
        color *= 0.22 + 0.78 * diffuse;
      }
      accumulated += remainingTransmittance * alpha * color;
      remainingTransmittance *= 1.0 - alpha;
      if (remainingTransmittance < 0.02) break;
    }
    point += ray * uStepMm;
  }
  vec3 background = vec3(0.012, 0.029, 0.044);
  outColor = vec4(accumulated + background * remainingTransmittance, 1.0);
}`;
const MESH_VERTEX = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uMvp;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vPosition;
void main() { vPosition = (uModel * vec4(aPosition, 1.0)).xyz; vNormal = mat3(uModel) * aNormal; gl_Position = uMvp * vec4(aPosition, 1.0); }`;
const MESH_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(-1.0, 1.7, 2.2) - vPosition);
  float diffuse = 0.35 + 0.65 * max(dot(n, light), 0.0);
  outColor = vec4(uColor * diffuse + vec3(0.08, 0.04, 0.01), 1.0);
}`;

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'unknown GLSL compiler error';
    status.textContent = `Volume renderer shader failed: ${message}`;
    throw new Error(message);
  }
  return shader;
}
function program(vertexSource, fragmentSource) {
  const result = gl.createProgram();
  gl.attachShader(result, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(result, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(result) || 'unknown WebGL program link error';
    status.textContent = `Volume renderer could not link: ${message}`;
    throw new Error(message);
  }
  return result;
}
const volumeProgram = program(VOLUME_VERTEX, VOLUME_FRAGMENT);
const meshProgram = program(MESH_VERTEX, MESH_FRAGMENT);

function perspective(fov, aspect, near, far) {
  const out = new Float32Array(16); const f = 1 / Math.tan(fov / 2);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) / (near - far);
  out[11] = -1; out[14] = (2 * far * near) / (near - far);
  return out;
}
function cameraMatrix(yaw, pitch, distance, scale, pan) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  return new Float32Array([
    cy * scale, sy * sx * scale, sy * cx * scale, 0,
    0, cx * scale, -sx * scale, 0,
    -sy * scale, cy * sx * scale, cy * cx * scale, 0,
    pan[0], pan[1], -distance, 1,
  ]);
}
function makeCube(shape, signedSpacing) {
  const half = shape.map((n, axis) => n * Math.abs(signedSpacing[axis]) / 2);
  const faces = [
    [[-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1]],
    [[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1],[ 1,-1,-1]],
    [[ 1,-1,-1],[ 1, 1,-1],[ 1, 1, 1],[ 1,-1, 1]],
    [[-1,-1,-1],[-1,-1, 1],[-1, 1, 1],[-1, 1,-1]],
    [[-1, 1,-1],[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1]],
    [[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1]],
  ];
  const positions = []; const texcoords = [];
  for (const face of faces) for (const corner of [0,1,2,0,2,3]) {
    const p = face[corner].map((sign, axis) => sign * half[axis]);
    const tex = p.map((value, axis) => (value / signedSpacing[axis] + shape[axis] / 2) / shape[axis]);
    positions.push(...p); texcoords.push(...tex);
  }
  return { positions: new Float32Array(positions), texcoords: new Float32Array(texcoords), half };
}
function makeVolumeRenderer(shape, spacing) {
  const cube = makeCube(shape, spacing);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  for (const [name, data, size] of [['aPosition', cube.positions, 3], ['aTexCoord', cube.texcoords, 3]]) {
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(volumeProgram, name); gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  const uniforms = Object.fromEntries(['uMvp','uVolume','uColorTf','uOpacityTf','uCameraLocal','uLightDirection','uSpacing','uShape','uStepMm','uReferenceStepMm','uOpacity','uJitter','uWindowLow','uWindowHigh'].map((name) => [name, gl.getUniformLocation(volumeProgram, name)]));
  return { vao, count: cube.positions.length / 3, half: cube.half, uniforms, shape, spacing };
}

function transferValue(points, x, channels) {
  let right = points.findIndex((point) => point[0] >= x);
  if (right < 0) right = points.length - 1;
  const left = Math.max(0, right - 1);
  const span = points[right][0] - points[left][0];
  const t = span > 0 ? Math.max(0, Math.min(1, (x - points[left][0]) / span)) : 0;
  return Array.from({ length: channels }, (_, channel) => points[left][channel + 1] * (1 - t) + points[right][channel + 1] * t);
}

function makeTransferTexture(points, channels, internalFormat, format) {
  const width = 256;
  const data = new Uint8Array(width * channels);
  for (let i = 0; i < width; i += 1) {
    const value = transferValue(points, i / (width - 1), channels);
    for (let channel = 0; channel < channels; channel += 1) data[i * channels + channel] = Math.round(Math.max(0, Math.min(1, value[channel])) * 255);
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, 1, 0, format, gl.UNSIGNED_BYTE, data);
  return texture;
}

const COLOR_TRANSFER_POINTS = [
  [0.0, 0.035, 0.055, 0.075], [0.2, 0.22, 0.25, 0.27],
  [0.55, 0.56, 0.59, 0.61], [1.0, 0.94, 0.96, 0.98],
];
const OPACITY_TRANSFER_POINTS = [
  [0.0, 0.0], [0.12, 0.0], [0.25, 0.006], [0.45, 0.025],
  [0.68, 0.075], [0.84, 0.18], [1.0, 0.36],
];
function makeMeshRenderer(mesh, color) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  for (const [name, data] of [['aPosition', mesh.positions], ['aNormal', mesh.normals]]) {
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(meshProgram, name); gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  const uniforms = Object.fromEntries(['uMvp','uModel','uColor'].map((name) => [name, gl.getUniformLocation(meshProgram, name)]));
  return { vao, count: mesh.positions.length / 3, positions: mesh.positions, uniforms, color };
}

let meta; let mri; let labels; let volumeRenderer; let segments = []; let meshes = {}; let activeMeshes = [];
let selected = [0, 0, 0]; let mode = 'both'; let smoothSurface = false; let opacity = 0.7;
let windowLow = 0.15; let windowHigh = 0.95;
let yaw = -0.55; let pitch = 0.35; let distance = 2.8; let scale = 1; let pan = [0, 0];
let pointer = null; let isDragging = false; let tapStart = null;
let redrawScheduled = false;
function scheduleDraw3d() {
  if (redrawScheduled) return;
  redrawScheduled = true;
  requestAnimationFrame(() => { redrawScheduled = false; draw3d(); });
}
const views = Object.fromEntries(['axial','coronal','sagittal'].map((name) => [name, $(`#${name}`)]));
const sliders = ['x','y','z'].map((name) => $(`#${name}`));
const clamp = (value, max) => Math.max(0, Math.min(max, value));
const sourceIndex = (x, y, z) => z * meta.shape_xyz[1] * meta.shape_xyz[0] + y * meta.shape_xyz[0] + x;

async function load() {
  meta = await fetch('./data/meta.json').then((response) => { if (!response.ok) throw new Error('missing data/meta.json; run build_demo.py'); return response.json(); });
  const [mriBuffer, labelBuffer, cropBuffer] = await Promise.all([
    fetch(`./${meta.mpr_mri_file}`).then((r) => r.arrayBuffer()),
    fetch(`./${meta.mpr_labels_file}`).then((r) => r.arrayBuffer()),
    fetch(`./${meta.volume_crop_file}`).then((r) => r.arrayBuffer()),
  ]);
  mri = new Uint8Array(mriBuffer); labels = new Uint8Array(labelBuffer);
  if (mri.length !== meta.shape_xyz.reduce((a, b) => a * b, 1) || labels.length !== mri.length) throw new Error('MRI/label payload length does not match metadata');
  const cropShape = meta.crop_shape_xyz; const spacing = meta.spacing_signed_xyz_mm;
  const maxDimensionMm = Math.max(...cropShape.map((n, i) => n * Math.abs(spacing[i])));
  scale = 2.0 / maxDimensionMm;
  volumeRenderer = makeVolumeRenderer(cropShape, spacing);
  volumeRenderer.colorTransferTexture = makeTransferTexture(COLOR_TRANSFER_POINTS, 3, gl.RGB8, gl.RGB);
  volumeRenderer.opacityTransferTexture = makeTransferTexture(OPACITY_TRANSFER_POINTS, 1, gl.R8, gl.RED);
  const volume16 = new Uint16Array(cropBuffer);
  const volumeRg8 = new Uint8Array(volume16.length * 2);
  for (let i = 0; i < volume16.length; i += 1) {
    volumeRg8[i * 2] = volume16[i] >>> 8;
    volumeRg8[i * 2 + 1] = volume16[i] & 0xff;
  }
  const texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG8, cropShape[0], cropShape[1], cropShape[2], 0, gl.RG, gl.UNSIGNED_BYTE, volumeRg8);
  volumeRenderer.texture = texture;
  volumeRenderer.step = Math.min(...spacing.map(Math.abs)) * 0.9;
  volumeRenderer.referenceStep = Math.min(...spacing.map(Math.abs));
  volumeRenderer.jitter = $('#ray-jitter').checked ? 1 : 0;
  $('#ray-jitter').addEventListener('change', (event) => { volumeRenderer.jitter = event.currentTarget.checked ? 1 : 0; scheduleDraw3d(); });
  segments = meta.segments;
  await Promise.all(segments.map(async (item) => {
    const [rawObj, smoothObj] = await Promise.all([
      fetch(`./data/${item.marching_cubes.file}`).then((r) => r.text()),
      item.smoothed_marching_cubes
        ? fetch(`./data/${item.smoothed_marching_cubes.file}`).then((r) => r.text())
        : Promise.resolve(null),
    ]);
    meshes[item.label_id] = { segment: item, raw: makeMeshRenderer(parseObj(rawObj), item.color_rgb) };
    if (smoothObj) meshes[item.label_id].smooth = makeMeshRenderer(parseObj(smoothObj), item.color_rgb);
  }));
  activeMeshes = segments.map((item) => meshes[item.label_id].raw);
  const bboxCenter = meta.crop_min_xyz.map((v, axis) => v + (cropShape[axis] - 1) / 2);
  selected = bboxCenter.map((value, axis) => clamp(Math.round(value), meta.shape_xyz[axis] - 1));
  sliders.forEach((slider, axis) => {
    slider.min = 0; slider.max = meta.shape_xyz[axis] - 1; slider.value = selected[axis];
    slider.addEventListener('input', () => { selected[axis] = Number(slider.value); drawMpr(); });
  });
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      pickLabel.textContent = mode === 'volume' ? 'Tap Volume + label, then click the orange surface to map back to MPR' : 'Tap the orange surface to jump to its source voxel';
      scheduleDraw3d();
    });
  }
  $('#fit').addEventListener('click', () => { yaw = -0.55; pitch = 0.35; distance = 2.8; pan = [0, 0]; scheduleDraw3d(); });
  $('#smoothing').addEventListener('click', (event) => {
    if (!segments.some((item) => meshes[item.label_id].smooth)) return;
    smoothSurface = !smoothSurface;
    activeMeshes = segments.map((item) => smoothSurface
      ? (meshes[item.label_id].smooth || meshes[item.label_id].raw)
      : meshes[item.label_id].raw);
    event.currentTarget.textContent = smoothSurface ? 'Surface: lightly smoothed' : 'Surface: raw label';
    scheduleDraw3d();
  });
  $('#opacity').addEventListener('input', (event) => { opacity = Number(event.currentTarget.value) / 100; scheduleDraw3d(); });
  $('#window-low').addEventListener('input', (event) => {
    windowLow = Math.min(Number(event.currentTarget.value) / 100, windowHigh - 0.05);
    event.currentTarget.value = Math.round(windowLow * 100);
    scheduleDraw3d();
  });
  $('#window-high').addEventListener('input', (event) => {
    windowHigh = Math.max(Number(event.currentTarget.value) / 100, windowLow + 0.05);
    event.currentTarget.value = Math.round(windowHigh * 100);
    scheduleDraw3d();
  });
  Object.entries(views).forEach(([name, target]) => {
    target.addEventListener('pointerdown', (event) => setFromMprPointer(name, event));
    target.addEventListener('wheel', (event) => {
      event.preventDefault(); const axis = name === 'axial' ? 2 : name === 'coronal' ? 1 : 0;
      selected[axis] = clamp(selected[axis] + (event.deltaY > 0 ? 1 : -1), meta.shape_xyz[axis] - 1); drawMpr();
    }, { passive: false });
  });
  meshInfo.textContent = segments.map((item) => `${item.name}: ${item.marching_cubes.triangle_count.toLocaleString()} MC triangles`).join(' · ');
  $('#source-note').textContent = `${meta.source_format} · ${meta.shape_xyz.join('×')} voxels · spacing ${meta.spacing_signed_xyz_mm.map(Math.abs).map((v) => v.toFixed(2)).join('×')} mm · source MRI + integer labelmap remain authoritative.`;
  status.textContent = `${meta.status} · ${segments.map((item) => item.name).join(', ')}`;
  drawMpr();
  scheduleDraw3d();
}

function intensityAt(x, y, z) { return mri[sourceIndex(x, y, z)]; }
function labelAt(x, y, z) { return labels[sourceIndex(x, y, z)] !== 0; }
function drawMprView(name) {
  const target = views[name]; const ctx = target.getContext('2d');
  const { width, height } = target; const image = ctx.createImageData(width, height); const pixels = image.data;
  const [nx, ny, nz] = meta.shape_xyz;
  const dims = name === 'axial' ? [nx, ny] : name === 'coronal' ? [nx, nz] : [ny, nz];
  for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
    const c = Math.min(dims[0] - 1, Math.floor(col * dims[0] / width));
    const r = Math.min(dims[1] - 1, Math.floor(row * dims[1] / height));
    let x, y, z;
    if (name === 'axial') [x, y, z] = [c, ny - 1 - r, selected[2]];
    if (name === 'coronal') [x, y, z] = [c, selected[1], nz - 1 - r];
    if (name === 'sagittal') [x, y, z] = [selected[0], c, nz - 1 - r];
    const value = intensityAt(x, y, z); const labeled = labelAt(x, y, z); const at = (row * width + col) * 4;
    pixels[at] = labeled ? Math.round(value * 0.52 + 122) : value;
    pixels[at + 1] = labeled ? Math.round(value * 0.34 + 58) : value;
    pixels[at + 2] = labeled ? Math.round(value * 0.12 + 20) : value;
    pixels[at + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const cross = name === 'axial' ? [selected[0], ny - 1 - selected[1]]
    : name === 'coronal' ? [selected[0], nz - 1 - selected[2]]
      : [selected[1], nz - 1 - selected[2]];
  const crossX = cross[0] * width / dims[0]; const crossY = cross[1] * height / dims[1];
  ctx.strokeStyle = '#69e1e8'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(crossX, 0); ctx.lineTo(crossX, height); ctx.moveTo(0, crossY); ctx.lineTo(width, crossY); ctx.stroke();
}
function drawMpr() {
  Object.keys(views).forEach(drawMprView);
  sliders.forEach((slider, axis) => { slider.value = selected[axis]; });
  $('#voxel').textContent = `source voxel ${selected.join(', ')} · Z slice ${selected[2]}`;
}
function setFromMprPointer(name, event) {
  const target = views[name]; const bounds = target.getBoundingClientRect();
  const [nx, ny, nz] = meta.shape_xyz;
  const dims = name === 'axial' ? [nx, ny] : name === 'coronal' ? [nx, nz] : [ny, nz];
  const c = clamp(Math.floor((event.clientX - bounds.left) * dims[0] / bounds.width), dims[0] - 1);
  const r = clamp(Math.floor((event.clientY - bounds.top) * dims[1] / bounds.height), dims[1] - 1);
  if (name === 'axial') [selected[0], selected[1]] = [c, ny - 1 - r];
  if (name === 'coronal') [selected[0], selected[2]] = [c, nz - 1 - r];
  if (name === 'sagittal') [selected[1], selected[2]] = [c, nz - 1 - r];
  drawMpr();
}

function draw3d() {
  if (!volumeRenderer || activeMeshes.length === 0) return;
  const dpr = isDragging ? Math.min(window.devicePixelRatio || 1, 0.75) : Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr)); const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  gl.viewport(0, 0, width, height); gl.enable(gl.DEPTH_TEST); gl.clearColor(0.012, 0.029, 0.044, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const projection = perspective(Math.PI / 4, width / height, 0.001, 100);
  const model = cameraMatrix(yaw, pitch, distance, scale, pan);
  const mvp = multiplyMat4(new Float32Array(16), projection, model);
  if (mode !== 'surface') {
    const invModel = invertMat4(new Float32Array(16), model); const cameraLocal = [invModel[12] / invModel[15], invModel[13] / invModel[15], invModel[14] / invModel[15]];
    gl.depthMask(false); gl.useProgram(volumeProgram); gl.bindVertexArray(volumeRenderer.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, volumeRenderer.texture);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, volumeRenderer.colorTransferTexture);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, volumeRenderer.opacityTransferTexture);
    gl.uniformMatrix4fv(volumeRenderer.uniforms.uMvp, false, mvp);
    gl.uniform1i(volumeRenderer.uniforms.uVolume, 0); gl.uniform1i(volumeRenderer.uniforms.uColorTf, 1); gl.uniform1i(volumeRenderer.uniforms.uOpacityTf, 2);
    gl.uniform3fv(volumeRenderer.uniforms.uCameraLocal, cameraLocal); gl.uniform3fv(volumeRenderer.uniforms.uLightDirection, [0.35, 0.65, 0.68]);
    gl.uniform3fv(volumeRenderer.uniforms.uSpacing, volumeRenderer.spacing); gl.uniform3fv(volumeRenderer.uniforms.uShape, volumeRenderer.shape);
    gl.uniform1f(volumeRenderer.uniforms.uStepMm, volumeRenderer.step * (isDragging ? 1.5 : 1)); gl.uniform1f(volumeRenderer.uniforms.uReferenceStepMm, volumeRenderer.referenceStep);
    gl.uniform1f(volumeRenderer.uniforms.uOpacity, opacity); gl.uniform1f(volumeRenderer.uniforms.uJitter, volumeRenderer.jitter);
    gl.uniform1f(volumeRenderer.uniforms.uWindowLow, windowLow); gl.uniform1f(volumeRenderer.uniforms.uWindowHigh, windowHigh);
    gl.drawArrays(gl.TRIANGLES, 0, volumeRenderer.count); gl.bindVertexArray(null);
  }
  if (mode !== 'volume') {
    gl.depthMask(true); gl.useProgram(meshProgram);
    for (const activeMesh of activeMeshes) {
      gl.bindVertexArray(activeMesh.vao);
      gl.uniformMatrix4fv(activeMesh.uniforms.uMvp, false, mvp); gl.uniformMatrix4fv(activeMesh.uniforms.uModel, false, model);
      gl.uniform3fv(activeMesh.uniforms.uColor, activeMesh.color); gl.drawArrays(gl.TRIANGLES, 0, activeMesh.count);
    }
    gl.bindVertexArray(null);
  }
  gl.depthMask(true);
}

function pickSurface(event) {
  if (mode === 'volume') { pickLabel.textContent = 'No label surface is visible; switch to Volume + label or Label surface'; return; }
  const bounds = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  const ndcY = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
  const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.001, 100);
  const model = cameraMatrix(yaw, pitch, distance, scale, pan);
  const combined = multiplyMat4(new Float32Array(16), projection, model);
  const inverse = invertMat4(new Float32Array(16), combined);
  const ray = inverse && screenRayFromNdc(ndcX, ndcY, inverse);
  let closest = null;
  for (let index = 0; index < activeMeshes.length; index += 1) {
    const hit = ray && rayMeshFirstHit(ray.origin, ray.direction, activeMeshes[index].positions);
    if (hit && (!closest || hit.distance < closest.hit.distance)) closest = { hit, segment: segments[index] };
  }
  if (!closest) { pickLabel.textContent = 'Pick: no segmentation surface at this location'; return; }
  const voxel = nearestLabeledVoxel(closest.hit.point, closest.segment.label_id, labels, meta);
  if (!voxel) { pickLabel.textContent = 'Pick hit did not resolve to this label in the source labelmap'; return; }
  selected = voxel; drawMpr();
  pickLabel.textContent = `${closest.segment.name} → source voxel ${voxel.join(', ')} · axial Z slice ${voxel[2]}`;
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId); pointer = { x: event.clientX, y: event.clientY }; tapStart = pointer; isDragging = false;
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointer) return;
  const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
  if (Math.abs(event.clientX - tapStart.x) + Math.abs(event.clientY - tapStart.y) > 5) isDragging = true;
  if (event.buttons === 2 || event.shiftKey) { const gain = distance / Math.max(1, canvas.clientHeight); pan[0] += dx * gain; pan[1] -= dy * gain; }
  else { yaw += dx * 0.008; pitch = Math.max(-1.45, Math.min(1.45, pitch + dy * 0.008)); }
  pointer = { x: event.clientX, y: event.clientY };
  scheduleDraw3d();
});
canvas.addEventListener('pointerup', (event) => { if (pointer && !isDragging && event.button === 0) pickSurface(event); pointer = null; tapStart = null; isDragging = false; scheduleDraw3d(); });
canvas.addEventListener('pointercancel', () => { pointer = null; tapStart = null; isDragging = false; scheduleDraw3d(); });
canvas.addEventListener('wheel', (event) => { event.preventDefault(); distance = Math.max(1.2, Math.min(8, distance * (event.deltaY > 0 ? 1.08 : 0.92))); scheduleDraw3d(); }, { passive: false });
window.addEventListener('resize', scheduleDraw3d);

load().catch((error) => { status.textContent = `POC load failed: ${error.message}`; console.error(error); });
