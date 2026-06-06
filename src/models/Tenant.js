import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base } from './_common.js';

export const Tenant = sequelize.define('Tenant', {
  id,
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('hospital', 'pm'), allowNull: false },
}, base);
