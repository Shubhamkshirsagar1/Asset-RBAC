import { sequelize } from '../db/sequelize.js';
import { base, fk } from './_common.js';

export const UserRole = sequelize.define('UserRole', {
  userId: { ...fk('User'), primaryKey: true },
  roleId: { ...fk('Role'), primaryKey: true },
}, base);
