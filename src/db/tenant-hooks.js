import { getTenantId } from './tenant-context.js';

// Adds `where: { tenantId }` to read / bulk-write options when a tenant is in scope.
function injectWhere(options) {
  const tenantId = getTenantId();
  if (!tenantId) return; // platform scope: run unfiltered
  options.where = { ...(options.where || {}), tenantId };
}

// Stamps the current tenant onto a new instance (runs on beforeValidate, before
// Sequelize's allowNull validation rejects a null tenantId).
function stamp(instance) {
  const tenantId = getTenantId();
  if (tenantId && instance.tenantId == null) instance.tenantId = tenantId;
}

// Registers hooks per tenant-scoped model. We register on the model directly
// (rather than a global sequelize hook) because global find hooks do NOT receive
// `options.model`, so there is no other reliable way to know the model is scoped.
export function installTenantHooks(sequelize) {
  for (const model of Object.values(sequelize.models)) {
    if (!model.rawAttributes?.tenantId) continue;

    model.addHook('beforeFind', injectWhere);
    model.addHook('beforeCount', injectWhere);
    model.addHook('beforeBulkUpdate', injectWhere);
    model.addHook('beforeBulkDestroy', injectWhere);

    model.addHook('beforeValidate', stamp);
    model.addHook('beforeBulkCreate', (instances) => {
      for (const instance of instances) stamp(instance);
    });
  }
}
