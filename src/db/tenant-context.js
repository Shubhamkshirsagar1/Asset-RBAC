import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithTenant(tenantId, callback) {
  return storage.run({ tenantId }, callback);
}

export function getTenantId() {
  return storage.getStore()?.tenantId;
}

export function requireTenantId() {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('No tenant context in scope');
  return tenantId;
}
