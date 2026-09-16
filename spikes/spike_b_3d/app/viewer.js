/*
 * SPIKE_B B1 — dependency-free WebGL diagnostic viewer.
 *
 * It deliberately loads the regenerable mesh at ../mesh/out/level_0_cell1.obj.
 * The OBJ is ignored by git; run mesh/build_mesh.py before starting the local
 * server. This keeps the spike small and prevents generated mesh bytes from
 * becoming a second source of truth.
 */

import { parseObj } from './obj.js';

const canvas = document.querySelector('#gl');
const status = document.querySelector('#status');
const trianglesLabel = document.querySelector('#triangles');
const fitButton = document.querySelector('#fit');
const shadeButton = document.querySelector('#shade');

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vNormal = mat3(uModel) * aNormal;
  vWorld = world.xyz;
  gl_Position = uProjection * world;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uLight;
uniform vec3 uColor;
uniform bool uShading;
out vec4 outColor;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLight - vWorld);
  vec3 viewDir = normalize(-vWorld);
  float diffuse = uShading ? max(dot(normal, lightDir), 0.0) : 0.72;
  float rim = uShading ? pow(1.0 - max(dot(normal, viewDir), 0.0), 2.3) : 0.0;
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = uShading ? pow(max(dot(normal, halfDir), 0.0), 28.0) : 0.0;
  // Pale cyan and restrained highlights match a clinical segmentation viewer,
  // while keeping surface contours readable against the dark MRI-style field.
  vec3 color = uColor * (0.34 + 0.62 * diffuse + 0.18 * rim)
             + vec3(0.78, 0.95, 1.0) * (0.20 * specular);
  outColor = vec4(color, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader compilation failed');
  }
  return shader;
}

function link(gl, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  return program;
}

function perspective(out, fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function modelMatrix(out, yaw, pitch, distance, scale, center, pan) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  // The array below is column-major (WebGL convention), so compute the
  // rotation with the same rows before translating the mesh centre to zero.
  const rx = cy * center[0] - sy * center[2];
  const ry = sy * sx * center[0] + cx * center[1] + cy * sx * center[2];
  const rz = sy * cx * center[0] - sx * center[1] + cy * cx * center[2];
  // Rotation Y then X, followed by a uniform scale and camera translation.
  out.set([
    cy * scale, sy * sx * scale, sy * cx * scale, 0,
    0, cx * scale, -sx * scale, 0,
    -sy * scale, cy * sx * scale, cy * cx * scale, 0,
    -rx * scale + pan[0], -ry * scale + pan[1], -rz * scale - distance, 1,
  ]);
  return out;
}

function setup(gl, mesh) {
  const program = link(gl, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER), compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  const position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, position);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  const normal = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normal);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const aPosition = gl.getAttribLocation(program, 'aPosition');
  gl.bindBuffer(gl.ARRAY_BUFFER, position);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  const aNormal = gl.getAttribLocation(program, 'aNormal');
  gl.bindBuffer(gl.ARRAY_BUFFER, normal);
  gl.enableVertexAttribArray(aNormal);
  gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { program, vao, count: mesh.positions.length / 3,
    projection: gl.getUniformLocation(program, 'uProjection'),
    model: gl.getUniformLocation(program, 'uModel'),
    light: gl.getUniformLocation(program, 'uLight'),
    color: gl.getUniformLocation(program, 'uColor'),
    shading: gl.getUniformLocation(program, 'uShading') };
}

const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) {
  status.textContent = 'WebGL2 unavailable';
  throw new Error('B1 requires WebGL2');
}

let renderer;
let yaw = -0.55;
let pitch = 0.35;
let distance = 2.8;
let scale = 1;
let center = [0, 0, 0];
let pan = [0, 0];
let shading = true;
let pointers = new Map();
let dragMode = null;
let pinchState = null;

function panBy(dx, dy) {
  // Move in screen coordinates. Scaling by camera distance keeps panning
  // useful at both close and wide zoom levels.
  const gain = (distance * 1.25) / Math.max(1, canvas.clientHeight);
  pan[0] += dx * gain;
  pan[1] -= dy * gain;
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
}

function draw() {
  if (!renderer) return;
  resize();
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.015, 0.033, 0.055, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(renderer.program);
  gl.bindVertexArray(renderer.vao);
  const projection = perspective(new Float32Array(16), Math.PI / 4, canvas.width / canvas.height, 0.01, 100);
  const model = modelMatrix(new Float32Array(16), yaw, pitch, distance, scale, center, pan);
  gl.uniformMatrix4fv(renderer.projection, false, projection);
  gl.uniformMatrix4fv(renderer.model, false, model);
  gl.uniform3f(renderer.light, -1.8, 2.6, 3.2);
  gl.uniform3f(renderer.color, 0.31, 0.77, 0.82);
  gl.uniform1i(renderer.shading, shading ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, renderer.count);
  gl.bindVertexArray(null);
  requestAnimationFrame(draw);
}

function setZoom(next) {
  distance = Math.min(8, Math.max(1.05, next));
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) {
    dragMode = event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
  }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchState = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  const previous = pointers.get(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const next = Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinchState) {
      setZoom(distance * (pinchState.distance / Math.max(1, next)));
      panBy(midpoint.x - pinchState.x, midpoint.y - pinchState.y);
    }
    pinchState = { distance: next, ...midpoint };
  } else if (dragMode === 'orbit') {
    yaw += (event.clientX - previous.x) * 0.009;
    pitch = Math.max(-1.45, Math.min(1.45, pitch + (event.clientY - previous.y) * 0.009));
  } else if (dragMode === 'pan') {
    panBy(event.clientX - previous.x, event.clientY - previous.y);
  }
});
function releasePointer(event) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchState = null;
  if (pointers.size === 0) dragMode = null;
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  setZoom(distance * Math.exp(event.deltaY * 0.001));
}, { passive: false });
fitButton.addEventListener('click', () => { yaw = -0.55; pitch = 0.35; distance = 2.8; pan = [0, 0]; });
shadeButton.addEventListener('click', () => {
  shading = !shading;
  shadeButton.textContent = `shading: ${shading ? 'on' : 'off'}`;
});

fetch('../mesh/out/level_0_cell1.obj')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} — run mesh/build_mesh.py first`);
    return response.text();
  })
  .then((text) => {
    const mesh = parseObj(text);
    renderer = setup(gl, mesh);
    // Centre/normalise from the loaded OBJ so the same camera works for any
    // spacing/origin in the canonical fixture.
    const values = mesh.positions;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        lo[axis] = Math.min(lo[axis], values[i + axis]);
        hi[axis] = Math.max(hi[axis], values[i + axis]);
      }
    }
    center = lo.map((v, axis) => (v + hi[axis]) / 2);
    let maxRadius = 0;
    for (let i = 0; i < values.length; i += 3) {
      maxRadius = Math.max(maxRadius, Math.hypot(values[i] - center[0], values[i + 1] - center[1], values[i + 2] - center[2]));
    }
    scale = maxRadius ? 1 / maxRadius : 1;
    trianglesLabel.textContent = `${mesh.triangles.toLocaleString()} triangles`;
    status.textContent = 'level_0_cell1.obj · loaded';
    draw();
  })
  .catch((error) => {
    status.textContent = error.message;
    console.error(error);
  });
