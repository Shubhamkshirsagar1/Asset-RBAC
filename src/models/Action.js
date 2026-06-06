import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base } from './_common.js';

// Global catalog of action verbs (no tenantId).
export const Action = sequelize.define('Action', {
  id,
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  label: { type: DataTypes.STRING, allowNull: false },
}, base);
