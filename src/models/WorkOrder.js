import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const WorkOrder = sequelize.define('WorkOrder', {
  id,
  tenantId: fk('Tenant'),
  assetId: fk('Asset'),
  requestedById: { type: DataTypes.UUID, allowNull: false },
  assignedToUserId: { type: DataTypes.UUID, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'requested' },
  cost: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, base);
