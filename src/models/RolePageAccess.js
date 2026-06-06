import { DataTypes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { base, fk } from './_common.js';

export const RolePageAccess = sequelize.define('RolePageAccess', {
  roleId: { ...fk('Role'), primaryKey: true },
  pageId: { ...fk('Page'), primaryKey: true },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, base);
