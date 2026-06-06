import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const ResourceType = sequelize.define('ResourceType', {
  id,
  tenantId: fk('Tenant'),
  key: { type: DataTypes.STRING, allowNull: false },
  label: { type: DataTypes.STRING, allowNull: false },
}, { ...base, indexes: [{ unique: true, fields: ['tenantId', 'key'] }] });
