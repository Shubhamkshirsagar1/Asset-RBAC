import { sequelize } from '../db/sequelize.js';
import { id, base, fk, grantFields } from './_common.js';

export const Grant = sequelize.define('Grant', {
  id,
  roleId: fk('Role'),
  ...grantFields,
}, base);
