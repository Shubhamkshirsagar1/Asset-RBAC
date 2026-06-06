import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { descriptorToWhere } from '../src/lib/scope-where.js';

test('all → empty where', () => {
  assert.deepEqual(descriptorToWhere({ type: 'all' }), {});
});

test('own with a single owner field', () => {
  assert.deepEqual(
    descriptorToWhere({ type: 'own', userId: 'u1' }, { ownerFields: ['assignedToUserId'] }),
    { assignedToUserId: 'u1' }
  );
});

test('own with multiple owner fields → OR', () => {
  const w = descriptorToWhere({ type: 'own', userId: 'u1' }, { ownerFields: ['requestedById', 'assignedToUserId'] });
  assert.deepEqual(w[Op.or], [{ requestedById: 'u1' }, { assignedToUserId: 'u1' }]);
});

test('orgUnit with an org field → IN', () => {
  const w = descriptorToWhere({ type: 'orgUnit', orgUnitIds: ['d1', 'd2'] }, { orgField: 'orgUnitId' });
  assert.deepEqual(w.orgUnitId[Op.in], ['d1', 'd2']);
});

test('orgUnit without an org field → match none', () => {
  const w = descriptorToWhere({ type: 'orgUnit', orgUnitIds: ['d1'] }, { ownerFields: ['x'] });
  assert.deepEqual(w.id[Op.in], []);
});

test('none → match none', () => {
  const w = descriptorToWhere({ type: 'none' });
  assert.deepEqual(w.id[Op.in], []);
});
