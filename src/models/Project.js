import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const Project = sequelize.define('Project', {
  id,
  tenantId: fk('Tenant'),
  orgUnitId: { type: DataTypes.UUID, allowNull: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
}, base);
