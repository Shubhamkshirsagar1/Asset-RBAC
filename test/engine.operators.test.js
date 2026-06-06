import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPath, resolveOperand, operators } from '../src/engine/operators.js';

const ctx = {
  user: { id: 'u1', departmentIds: ['d1', 'd2'], attributes: { region: 'EU' } },
  resource: { ownerId: 'u1', orgUnitId: 'd2', value: 4000, status: 'draft' },
  env: { now: new Date('2026-06-06T10:00:00Z') },
};

test('getPath reads nested paths', () => {
  assert.equal(getPath(ctx, 'resource.value'), 4000);
  assert.equal(getPath(ctx, 'user.attributes.region'), 'EU');
  assert.equal(getPath(ctx, 'resource.missing'), undefined);
});

test('resolveOperand resolves $-refs and passes literals through', () => {
  assert.equal(resolveOperand('$user.id', ctx), 'u1');
  assert.deepEqual(resolveOperand('$user.departmentIds', ctx), ['d1', 'd2']);
  assert.equal(resolveOperand(5000, ctx), 5000);
  assert.equal(resolveOperand('literal', ctx), 'literal');
});

test('comparison operators', () => {
  assert.equal(operators.eq('u1', 'u1', ctx), true);
  assert.equal(operators.ne('a', 'b', ctx), true);
  assert.equal(operators.lt(3, 5, ctx), true);
  assert.equal(operators.lte(5, 5, ctx), true);
  assert.equal(operators.gt(6, 5, ctx), true);
  assert.equal(operators.in('d2', ['d1', 'd2'], ctx), true);
  assert.equal(operators.in('x', ['d1'], ctx), false);
});

test('owner / deptMember / statusIs / exists', () => {
  assert.equal(operators.owner('u1', true, ctx), true);
  assert.equal(operators.owner('u9', true, ctx), false);
  assert.equal(operators.deptMember('d2', true, ctx), true);
  assert.equal(operators.statusIs('draft', ['draft', 'new'], ctx), true);
  assert.equal(operators.statusIs('done', 'draft', ctx), false);
  assert.equal(operators.exists('x', true, ctx), true);
  assert.equal(operators.exists(undefined, true, ctx), false);
});

test('timeWindow compares env time-of-day to a window', () => {
  assert.equal(operators.timeWindow(ctx.env.now, { start: '09:00', end: '17:00' }, ctx), true);
  assert.equal(operators.timeWindow(ctx.env.now, { start: '18:00', end: '20:00' }, ctx), false);
});
