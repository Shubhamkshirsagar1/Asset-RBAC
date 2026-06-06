import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAccess, resolveScope } from '../src/engine/index.js';

const user = { id: 'u1', tenantId: 't1', departmentIds: ['d1'], facilityIds: ['f1'] };
const env = { now: new Date('2026-06-06T10:00:00Z') };
const g = (o) => ({
  effect: 'allow', resourceTypeKey: 'asset', actionKey: 'read',
  scope: 'any', condition: null, expiresAt: null, ...o,
});

test('no grants → denied', () => {
  const d = evaluateAccess({ grants: [], action: 'read', resourceType: 'asset', user, resource: {}, env });
  assert.equal(d.allowed, false);
});

test('matching allow with any scope → allowed', () => {
  const d = evaluateAccess({ grants: [g({})], action: 'read', resourceType: 'asset', user, resource: { ownerId: 'u9' }, env });
  assert.equal(d.allowed, true);
  assert.equal(d.scope, 'any');
});

test('own scope passes only on own resource', () => {
  const grants = [g({ scope: 'own' })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { ownerId: 'u1' }, env }).allowed, true);
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { ownerId: 'u9' }, env }).allowed, false);
});

test('condition must hold', () => {
  const grants = [g({ scope: 'any', condition: { 'resource.value': { lte: 5000 } } })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { value: 4000 }, env }).allowed, true);
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { value: 9000 }, env }).allowed, false);
});

test('deny overrides allow', () => {
  const grants = [g({}), g({ effect: 'deny' })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: {}, env }).allowed, false);
});

test('expired grant is ignored', () => {
  const grants = [g({ expiresAt: new Date('2020-01-01') })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: {}, env }).allowed, false);
});

test('wildcard grant matches any resourceType/action', () => {
  const grants = [g({ resourceTypeKey: '*', actionKey: '*' })];
  assert.equal(evaluateAccess({ grants, action: 'delete', resourceType: 'project', user, resource: {}, env }).allowed, true);
});

test('resolveScope picks broadest scope for lists', () => {
  const grants = [g({ scope: 'own' }), g({ scope: 'dept' })];
  const r = resolveScope({ grants, action: 'read', resourceType: 'asset', user, env });
  assert.equal(r.allowed, true);
  assert.equal(r.scope, 'dept');
  assert.deepEqual(r.descriptor, { type: 'orgUnit', orgUnitIds: ['d1'] });
});

test('resolveScope denied by unconditional deny', () => {
  const grants = [g({}), g({ effect: 'deny', condition: null })];
  assert.equal(resolveScope({ grants, action: 'read', resourceType: 'asset', user, env }).allowed, false);
});
