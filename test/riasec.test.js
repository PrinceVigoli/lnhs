import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCompatibility } from '../lib/recommendation.js';
import { electives, catalog, validateElectives } from '../config/electives.js';

test('normalizes each strand against its own possible signal', () => {
  const result = computeCompatibility({R: 0, I: 7, A: 0, S: 0, E: 0, C: 0});
  assert.equal(result.percentages.STEM, 100);
  assert.equal(result.recommended, 'STEM');
});

test('enables a populated elective list for every strand', () => {
  for (const strand of ['STEM','ABM','HUMSS','TVL','GAS']) assert.ok(electives[strand].length > 0, `${strand} should have electives`);
  assert.ok(catalog.length >= 75, 'full DepEd catalog should be present');
});

test('accepts ranked choices only from the chosen strand catalog', () => {
  assert.equal(validateElectives('HUMSS', ['creative_writing']).valid, true);
  assert.equal(validateElectives('ABM', ['creative_writing']).valid, false);
});

test('splits conventional signal fairly between ABM and GAS', () => {
  const result = computeCompatibility({R: 0, I: 0, A: 0, S: 0, E: 0, C: 7});
  assert.equal(result.percentages.ABM, 33);
  assert.equal(result.percentages.GAS, 100);
});
