import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const Vendor = sequelize.define('Vendor', {
  id,
  tenantId: fk('Tenant'),
  name: { type: DataTypes.STRING, allowNull: false },
}, base);
