import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const Task = sequelize.define('Task', {
  id,
  tenantId: fk('Tenant'),
  projectId: fk('Project'),
  assigneeId: { type: DataTypes.UUID, allowNull: true },
  title: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'todo' },
}, base);
