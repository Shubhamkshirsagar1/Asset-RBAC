import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCOPE_RANK, scopeSatisfiesResource, scopeFilterDescriptor } from '../src/engine/scope.js';

const user = { id: 'u1', departmentIds: ['d1'], facilityIds: ['f1'] };

test('scope ranking: any broadest, own narrowest', () => {
  assert.ok(SCOPE_RANK.any > SCOPE_RANK.tenant);
  assert.ok(SCOPE_RANK.tenant > SCOPE_RANK.facility);
  assert.ok(SCOPE_RANK.facility > SCOPE_RANK.dept);
  assert.ok(SCOPE_RANK.dept > SCOPE_RANK.own);
});

test('any and tenant always satisfy on a resource', () => {
  assert.equal(scopeSatisfiesResource('any', user, { ownerId: 'x' }), true);
  assert.equal(scopeSatisfiesResource('tenant', user, { ownerId: 'x' }), true);
});

test('own matches any conventional owner field (owner/assignee/requester)', () => {
  assert.equal(scopeSatisfiesResource('own', user, { ownerId: 'u1' }), true);
  assert.equal(scopeSatisfiesResource('own', user, { assignedToUserId: 'u1' }), true);
  assert.equal(scopeSatisfiesResource('own', user, { assigneeId: 'u1' }), true);
  assert.equal(scopeSatisfiesResource('own', user, { requestedById: 'u1' }), true);
  assert.equal(scopeSatisfiesResource('own', user, { ownerId: 'u9' }), false);
});

test('dept / facility check org membership', () => {
  assert.equal(scopeSatisfiesResource('dept', user, { orgUnitId: 'd1' }), true);
  assert.equal(scopeSatisfiesResource('dept', user, { orgUnitId: 'd2' }), false);
  assert.equal(scopeSatisfiesResource('facility', user, { orgUnitId: 'f1' }), true);
});

test('scopeFilterDescriptor returns list-filter intent', () => {
  assert.deepEqual(scopeFilterDescriptor('any', user), { type: 'all' });
  assert.deepEqual(scopeFilterDescriptor('own', user), { type: 'own', userId: 'u1' });
  assert.deepEqual(scopeFilterDescriptor('dept', user), { type: 'orgUnit', orgUnitIds: ['d1'] });
  assert.deepEqual(scopeFilterDescriptor('facility', user), { type: 'orgUnit', orgUnitIds: ['f1'] });
});
