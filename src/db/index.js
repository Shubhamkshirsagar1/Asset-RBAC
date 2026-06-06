import { sequelize } from './sequelize.js';
import { models } from './models.js';
import { installTenantHooks } from './tenant-hooks.js';

// Global hooks enforce tenant isolation by reading the AsyncLocalStorage context.
// Queries run inside `runWithTenant(...)` are auto-scoped; queries run outside any
// tenant context (login, seeding, platform admin) run unscoped by design.
installTenantHooks(sequelize);

export { sequelize, models };
