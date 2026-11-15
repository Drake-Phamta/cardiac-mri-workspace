// node --test mobile/test/  - the experiment names every screen shares (lib/experimentNames.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { experimentName, namedExperiment } from '../src/lib/experimentNames.mjs';

test('EN1 an experiment of the matrix is named by its family and data fraction, never by its id', () => {
  assert.deepEqual(
    ['EXP-U-025', 'EXP-U-050', 'EXP-U-100', 'EXP-D-025', 'EXP-D-050', 'EXP-D-100', 'EXP-D-PP'].map(experimentName),
    ['UNet 25 %', 'UNet 50 %', 'UNet 100 %', 'DINOv2 25 %', 'DINOv2 50 %', 'DINOv2 100 %', 'DINOv2 100 %'],
  );
  assert.ok(['EXP-U-025', 'EXP-D-PP'].every((id) => !/EXP-/.test(experimentName(id))), 'no id in a name');
  assert.equal(namedExperiment('EXP-D-PP').lane, 'PROCESSED');
  assert.equal(namedExperiment('EXP-D-100').lane, 'RAW');
});

test('EN2 an id outside the matrix is its own name, and no name is looked up on the object prototype', () => {
  assert.equal(experimentName('EXP_DEMO'), 'EXP_DEMO');
  assert.equal(experimentName('toString'), 'toString');
  assert.equal(namedExperiment('constructor'), null);
  assert.equal(namedExperiment(null), null);
  assert.equal(namedExperiment(undefined), null);
});
