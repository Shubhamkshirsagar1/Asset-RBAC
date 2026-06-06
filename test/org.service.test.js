import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { runWithTenant } from '../src/db/tenant-context.js';
import { resolveScopeIds } from '../src/services/org.service.js';
import { makeTenant, makeOrgUnit, makeUser, assignOrg, cleanupTenant } from './factories.js';

let tenant, facility, dept, ward, deptUser, noOrgUser;

before(async () => {
  tenant = await makeTenant();
  facility = await makeOrgUnit(tenant.id, { type: 'facility', name: 'F' });
  dept = await makeOrgUnit(tenant.id, { type: 'dept', name: 'D', parentId: facility.id });
  ward = await makeOrgUnit(tenant.id, { type: 'ward', name: 'W', parentId: dept.id });
  deptUser = await makeUser(tenant.id);
  noOrgUser = await makeUser(tenant.id);
  await assignOrg(deptUser.id, dept.id);
});

after(async () => {
  await cleanupTenant(tenant.id);
  await sequelize.close();
});

test('departmentIds = subtree of the user direct unit; facilityIds = subtree of the facility', async () => {
  const { departmentIds, facilityIds } = await runWithTenant(tenant.id, () => resolveScopeIds(deptUser.id));
  assert.deepEqual([...departmentIds].sort(), [dept.id, ward.id].sort());
  assert.deepEqual([...facilityIds].sort(), [facility.id, dept.id, ward.id].sort());
});

test('user with no org membership → empty id sets', async () => {
  const r = await runWithTenant(tenant.id, () => resolveScopeIds(noOrgUser.id));
  assert.deepEqual(r, { departmentIds: [], facilityIds: [] });
});
