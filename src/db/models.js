import { DataTypes } from 'sequelize';
import { sequelize } from './sequelize.js';

const id = { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true };
const base = { timestamps: false, freezeTableName: true };
const fk = (model) => ({ type: DataTypes.UUID, allowNull: false, references: { model, key: 'id' } });
const fkNull = (model) => ({ type: DataTypes.UUID, allowNull: true, references: { model, key: 'id' } });

export const Tenant = sequelize.define('Tenant', {
  id,
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('hospital', 'pm'), allowNull: false },
}, base);

export const Action = sequelize.define('Action', {
  id,
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  label: { type: DataTypes.STRING, allowNull: false },
}, base);

export const User = sequelize.define('User', {
  id,
  tenantId: fk('Tenant'),
  email: { type: DataTypes.STRING, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  attributes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { ...base, indexes: [{ unique: true, fields: ['tenantId', 'email'] }] });

export const OrgUnit = sequelize.define('OrgUnit', {
  id,
  tenantId: fk('Tenant'),
  parentId: fkNull('OrgUnit'),
  type: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
}, base);

export const Role = sequelize.define('Role', {
  id,
  tenantId: fk('Tenant'),
  name: { type: DataTypes.STRING, allowNull: false },
  parentRoleId: fkNull('Role'),
  isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { ...base, indexes: [{ unique: true, fields: ['tenantId', 'name'] }] });

export const ResourceType = sequelize.define('ResourceType', {
  id,
  tenantId: fk('Tenant'),
  key: { type: DataTypes.STRING, allowNull: false },
  label: { type: DataTypes.STRING, allowNull: false },
}, { ...base, indexes: [{ unique: true, fields: ['tenantId', 'key'] }] });

export const Page = sequelize.define('Page', {
  id,
  tenantId: fk('Tenant'),
  key: { type: DataTypes.STRING, allowNull: false },
  label: { type: DataTypes.STRING, allowNull: false },
  path: { type: DataTypes.STRING, allowNull: false },
  icon: { type: DataTypes.STRING, allowNull: true },
  order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  parentId: fkNull('Page'),
  requiredPermissions: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
  inheritFromParent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  isMenuItem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { ...base, indexes: [{ unique: true, fields: ['tenantId', 'key'] }] });

export const UserOrgUnit = sequelize.define('UserOrgUnit', {
  userId: { ...fk('User'), primaryKey: true },
  orgUnitId: { ...fk('OrgUnit'), primaryKey: true },
}, base);

export const UserRole = sequelize.define('UserRole', {
  userId: { ...fk('User'), primaryKey: true },
  roleId: { ...fk('Role'), primaryKey: true },
}, base);

const grantFields = {
  resourceTypeKey: { type: DataTypes.STRING, allowNull: false },
  actionKey: { type: DataTypes.STRING, allowNull: false },
  effect: { type: DataTypes.ENUM('allow', 'deny'), allowNull: false, defaultValue: 'allow' },
  scope: { type: DataTypes.ENUM('own', 'dept', 'facility', 'tenant', 'any'), allowNull: false, defaultValue: 'any' },
  condition: { type: DataTypes.JSONB, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
};

export const Grant = sequelize.define('Grant', {
  id,
  roleId: fk('Role'),
  ...grantFields,
}, base);

export const UserGrant = sequelize.define('UserGrant', {
  id,
  userId: fk('User'),
  ...grantFields,
}, base);

export const RolePageAccess = sequelize.define('RolePageAccess', {
  roleId: { ...fk('Role'), primaryKey: true },
  pageId: { ...fk('Page'), primaryKey: true },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, base);

export const AuditLog = sequelize.define('AuditLog', {
  id,
  tenantId: fk('Tenant'),
  userId: { type: DataTypes.UUID, allowNull: true },
  action: { type: DataTypes.STRING, allowNull: false },
  resourceType: { type: DataTypes.STRING, allowNull: false },
  resourceId: { type: DataTypes.STRING, allowNull: true },
  decision: { type: DataTypes.ENUM('allow', 'deny'), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  matchedGrantId: { type: DataTypes.STRING, allowNull: true },
  ts: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, base);

export const Asset = sequelize.define('Asset', {
  id,
  tenantId: fk('Tenant'),
  orgUnitId: { type: DataTypes.UUID, allowNull: true },
  assignedToUserId: { type: DataTypes.UUID, allowNull: true },
  name: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
  value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, base);

export const WorkOrder = sequelize.define('WorkOrder', {
  id,
  tenantId: fk('Tenant'),
  assetId: fk('Asset'),
  requestedById: { type: DataTypes.UUID, allowNull: false },
  assignedToUserId: { type: DataTypes.UUID, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'requested' },
  cost: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, base);

export const Vendor = sequelize.define('Vendor', {
  id,
  tenantId: fk('Tenant'),
  name: { type: DataTypes.STRING, allowNull: false },
}, base);

export const Contract = sequelize.define('Contract', {
  id,
  tenantId: fk('Tenant'),
  vendorId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
}, base);

export const Project = sequelize.define('Project', {
  id,
  tenantId: fk('Tenant'),
  orgUnitId: { type: DataTypes.UUID, allowNull: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
}, base);

export const Task = sequelize.define('Task', {
  id,
  tenantId: fk('Tenant'),
  projectId: fk('Project'),
  assigneeId: { type: DataTypes.UUID, allowNull: true },
  title: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'todo' },
}, base);

// Associations (extended in later phases as needed).
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
