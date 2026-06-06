import { sequelize } from '../db/sequelize.js';
import { base, fk } from './_common.js';

export const UserOrgUnit = sequelize.define('UserOrgUnit', {
  userId: { ...fk('User'), primaryKey: true },
  orgUnitId: { ...fk('OrgUnit'), primaryKey: true },
}, base);
