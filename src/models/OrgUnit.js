import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk, fkNull } from './_common.js';

export const OrgUnit = sequelize.define('OrgUnit', {
  id,
  tenantId: fk('Tenant'),
  parentId: fkNull('OrgUnit'),
  type: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
}, base);
