import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

// Awaits the callback INSIDE the ALS scope. Prisma queries are lazy thenables whose
// client-extension hooks run at await-time, so the await must happen within scope —
// otherwise the tenant context is already gone by the time the query executes.
export function runWithTenant(tenantId, callback) {
  return storage.run({ tenantId }, async () => callback());
}

export function getTenantId() {
  return storage.getStore()?.tenantId;
}

export function requireTenantId() {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('No tenant context in scope');
  return tenantId;
}
