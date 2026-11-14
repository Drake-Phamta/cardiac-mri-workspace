import { readFileSync } from 'node:fs';
import { parseObj } from './obj.js';

const check = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`ok  ${message}`);
};

const quad = parseObj(`\n# quad with texture-style face tokens\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1 2/2 3/3 4/4\n`);
check(quad.triangles === 2, 'quad triangulates to two triangles');
check(quad.positions.length === 18 && quad.normals.length === 18, 'expanded position/normal buffers match');
check(quad.normals[2] === 1 && quad.normals[5] === 1, 'flat normal points along +z');
const smoothQuad = parseObj(`\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n`, { normalMode: 'vertex' });
check(smoothQuad.triangles === quad.triangles, 'vertex-normal display keeps source triangle count');
check(smoothQuad.positions.every((value, i) => value === quad.positions[i]), 'vertex-normal display does not move exact mesh vertices');
check(smoothQuad.normals.every(Number.isFinite), 'vertex-normal display produces finite lighting normals');

const objPath = new URL('../mesh/out/level_0_cell1.obj', import.meta.url);
const obj = readFileSync(objPath, 'utf8');
const mesh = parseObj(obj);
check(mesh.triangles === 5648, 'canonical level_0_cell1.obj has 5648 triangles');
check(mesh.positions.length === mesh.normals.length, 'canonical buffers have equal lengths');
console.log('all B1 OBJ parser checks passed');
