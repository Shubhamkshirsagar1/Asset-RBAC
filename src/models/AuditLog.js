import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { id, base, fk } from './_common.js';

export const AuditLog = sequelize.define('AuditLog', {
  id,
  tenantId: fk('Tenant'),
  userId: { type: DataTypes.UUID, allowNull: true },
  action: { type: DataTypes.STRING, allowNull: false },
  resourceType: { type: DataTypes.STRING, allowNull: false },
  resourceId: { type: DataTypes.STRING, allowNull: true },
  decision: { type: DataTypes.ENUM('allow', 'deny'), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  matchedGrantId: { type: DataTypes.STRING, allowNull: true },
  ts: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, base);
