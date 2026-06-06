import { Tenant } from './Tenant.js';
import { User } from './User.js';
import { OrgUnit } from './OrgUnit.js';
import { UserOrgUnit } from './UserOrgUnit.js';
import { Role } from './Role.js';
import { UserRole } from './UserRole.js';
import { ResourceType } from './ResourceType.js';
import { Action } from './Action.js';
import { Grant } from './Grant.js';
import { UserGrant } from './UserGrant.js';
import { Page } from './Page.js';
import { RolePageAccess } from './RolePageAccess.js';
import { AuditLog } from './AuditLog.js';
import { Asset } from './Asset.js';
import { WorkOrder } from './WorkOrder.js';
import { Vendor } from './Vendor.js';
import { Contract } from './Contract.js';
import { Project } from './Project.js';
import { Task } from './Task.js';

// Associations are declared centrally (after all models are defined) to avoid
// circular imports between individual model files.
Tenant.hasMany(User, { foreignKey: 'tenantId' });
User.belongsTo(Tenant, { foreignKey: 'tenantId' });
Role.belongsTo(Role, { as: 'parent', foreignKey: 'parentRoleId' });
OrgUnit.belongsTo(OrgUnit, { as: 'parent', foreignKey: 'parentId' });
Page.belongsTo(Page, { as: 'parent', foreignKey: 'parentId' });

export const models = {
  Tenant, Action, User, OrgUnit, Role, ResourceType, Page,
  UserOrgUnit, UserRole, Grant, UserGrant, RolePageAccess, AuditLog,
  Asset, WorkOrder, Vendor, Contract, Project, Task,
};

export {
  Tenant, Action, User, OrgUnit, Role, ResourceType, Page,
  UserOrgUnit, UserRole, Grant, UserGrant, RolePageAccess, AuditLog,
  Asset, WorkOrder, Vendor, Contract, Project, Task,
};
