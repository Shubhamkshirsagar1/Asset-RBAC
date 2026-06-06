import { sequelize } from '../db/sequelize.js';
import { id, base, fk, grantFields } from './_common.js';

export const UserGrant = sequelize.define('UserGrant', {
  id,
  userId: fk('User'),
  ...grantFields,
}, base);
