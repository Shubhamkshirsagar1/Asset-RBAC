import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const User = sequelize.define('User', {
  id,
  tenantId: fk('Tenant'),
  email: { type: DataTypes.STRING, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  attributes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { ...base, indexes: [{ unique: true, fields: ['tenantId', 'email'] }] });
