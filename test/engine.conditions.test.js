import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCondition } from '../src/engine/conditions.js';

const ctx = {
  user: { id: 'u1', departmentIds: ['d1', 'd2'] },
  resource: { ownerId: 'u1', orgUnitId: 'd2', value: 4000, status: 'draft' },
  env: { now: new Date('2026-06-06T10:00:00Z') },
};

test('null/empty condition is always satisfied', () => {
  assert.equal(evaluateCondition(null, ctx), true);
  assert.equal(evaluateCondition({}, ctx), true);
});

test('single operator condition', () => {
  assert.equal(evaluateCondition({ 'resource.value': { lte: 5000 } }, ctx), true);
  assert.equal(evaluateCondition({ 'resource.value': { gt: 5000 } }, ctx), false);
});

test('ref operand resolves from ctx', () => {
  assert.equal(evaluateCondition({ 'resource.orgUnitId': { in: '$user.departmentIds' } }, ctx), true);
});

test('multiple entries AND together', () => {
  const cond = { 'resource.ownerId': { owner: true }, 'resource.status': { statusIs: ['draft'] } };
  assert.equal(evaluateCondition(cond, ctx), true);
  const cond2 = { 'resource.ownerId': { owner: true }, 'resource.status': { statusIs: ['done'] } };
  assert.equal(evaluateCondition(cond2, ctx), false);
});

test('unknown operator throws', () => {
  assert.throws(() => evaluateCondition({ 'resource.value': { bogus: 1 } }, ctx), /Unknown operator/);
});
