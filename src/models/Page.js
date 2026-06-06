import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk, fkNull } from './_common.js';

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
