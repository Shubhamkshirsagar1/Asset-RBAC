import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk, fkNull } from './_common.js';

export const Role = sequelize.define('Role', {
  id,
  tenantId: fk('Tenant'),
  name: { type: DataTypes.STRING, allowNull: false },
  parentRoleId: fkNull('Role'),
  isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { ...base, indexes: [{ unique: true, fields: ['tenantId', 'name'] }] });
