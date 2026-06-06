import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const Contract = sequelize.define('Contract', {
  id,
  tenantId: fk('Tenant'),
  vendorId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
}, base);
