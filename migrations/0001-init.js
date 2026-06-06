import { DataTypes } from 'sequelize';

const uuidPk = { type: DataTypes.UUID, primaryKey: true, allowNull: false };
const fk = (model, allowNull = false) => ({
  type: DataTypes.UUID,
  allowNull,
  references: { model, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE',
});

const grantColumns = {
  resourceTypeKey: { type: DataTypes.STRING, allowNull: false },
  actionKey: { type: DataTypes.STRING, allowNull: false },
  effect: { type: DataTypes.ENUM('allow', 'deny'), allowNull: false, defaultValue: 'allow' },
  scope: { type: DataTypes.ENUM('own', 'dept', 'facility', 'tenant', 'any'), allowNull: false, defaultValue: 'any' },
  condition: { type: DataTypes.JSONB, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
};

export async function up({ context: q }) {
  await q.createTable('Tenant', {
    id: uuidPk,
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('hospital', 'pm'), allowNull: false },
  });

  await q.createTable('Action', {
    id: uuidPk,
    key: { type: DataTypes.STRING, allowNull: false, unique: true },
    label: { type: DataTypes.STRING, allowNull: false },
  });

  await q.createTable('User', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    email: { type: DataTypes.STRING, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    attributes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  });
  await q.addConstraint('User', { fields: ['tenantId', 'email'], type: 'unique', name: 'User_tenantId_email_uk' });

  await q.createTable('OrgUnit', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    parentId: fk('OrgUnit', true),
    type: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
  });

  await q.createTable('Role', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    name: { type: DataTypes.STRING, allowNull: false },
    parentRoleId: fk('Role', true),
    isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  });
  await q.addConstraint('Role', { fields: ['tenantId', 'name'], type: 'unique', name: 'Role_tenantId_name_uk' });

  await q.createTable('ResourceType', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    key: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
  });
  await q.addConstraint('ResourceType', { fields: ['tenantId', 'key'], type: 'unique', name: 'ResourceType_tenantId_key_uk' });

  await q.createTable('Page', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    key: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    path: { type: DataTypes.STRING, allowNull: false },
    icon: { type: DataTypes.STRING, allowNull: true },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    parentId: fk('Page', true),
    requiredPermissions: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
    inheritFromParent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isMenuItem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });
  await q.addConstraint('Page', { fields: ['tenantId', 'key'], type: 'unique', name: 'Page_tenantId_key_uk' });

  await q.createTable('UserOrgUnit', {
    userId: { ...fk('User'), primaryKey: true },
    orgUnitId: { ...fk('OrgUnit'), primaryKey: true },
  });

  await q.createTable('UserRole', {
    userId: { ...fk('User'), primaryKey: true },
    roleId: { ...fk('Role'), primaryKey: true },
  });

  await q.createTable('Grant', {
    id: uuidPk,
    roleId: fk('Role'),
    ...grantColumns,
  });

  await q.createTable('UserGrant', {
    id: uuidPk,
    userId: fk('User'),
    ...grantColumns,
  });

  await q.createTable('RolePageAccess', {
    roleId: { ...fk('Role'), primaryKey: true },
    pageId: { ...fk('Page'), primaryKey: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

  await q.createTable('AuditLog', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    userId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },
    resourceType: { type: DataTypes.STRING, allowNull: false },
    resourceId: { type: DataTypes.STRING, allowNull: true },
    decision: { type: DataTypes.ENUM('allow', 'deny'), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    matchedGrantId: { type: DataTypes.STRING, allowNull: true },
    ts: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await q.createTable('Asset', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    orgUnitId: { type: DataTypes.UUID, allowNull: true },
    assignedToUserId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
    value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  });

  await q.createTable('WorkOrder', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    assetId: fk('Asset'),
    requestedById: { type: DataTypes.UUID, allowNull: false },
    assignedToUserId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'requested' },
    cost: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  });

  await q.createTable('Vendor', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    name: { type: DataTypes.STRING, allowNull: false },
  });

  await q.createTable('Contract', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    vendorId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
  });

  await q.createTable('Project', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    orgUnitId: { type: DataTypes.UUID, allowNull: true },
    ownerId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
  });

  await q.createTable('Task', {
    id: uuidPk,
    tenantId: fk('Tenant'),
    projectId: fk('Project'),
    assigneeId: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'todo' },
  });
}

export async function down({ context: q }) {
  const tables = [
    'Task', 'Project', 'Contract', 'Vendor', 'WorkOrder', 'Asset', 'AuditLog',
    'RolePageAccess', 'UserGrant', 'Grant', 'UserRole', 'UserOrgUnit',
    'Page', 'ResourceType', 'Role', 'OrgUnit', 'User', 'Action', 'Tenant',
  ];
  for (const t of tables) await q.dropTable(t, { cascade: true });

  const enums = [
    'enum_Tenant_type', 'enum_Grant_effect', 'enum_Grant_scope',
    'enum_UserGrant_effect', 'enum_UserGrant_scope', 'enum_AuditLog_decision',
  ];
  for (const e of enums) await q.sequelize.query(`DROP TYPE IF EXISTS "${e}"`);
}
