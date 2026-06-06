import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const Asset = sequelize.define('Asset', {
  id,
  tenantId: fk('Tenant'),
  orgUnitId: { type: DataTypes.UUID, allowNull: true },
  assignedToUserId: { type: DataTypes.UUID, allowNull: true },
  name: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
  value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, base);
