import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithTenant, getTenantId, requireTenantId } from '../src/db/tenant-context.js';

test('getTenantId returns undefined outside a tenant scope', () => {
  assert.equal(getTenantId(), undefined);
});

test('runWithTenant exposes the tenant id inside the callback', async () => {
  const seen = await runWithTenant('t_hospital', async () => getTenantId());
  assert.equal(seen, 't_hospital');
});

test('requireTenantId throws outside a tenant scope', () => {
  assert.throws(() => requireTenantId(), /No tenant context/);
});
