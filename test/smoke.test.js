// End-to-end smoke test. Boots the app on a random port and exercises the
// RBAC behavior that matters. Run with: npm test
import assert from 'node:assert';
import { createApp } from '../src/app.js';

const server = createApp().listen(0);
const base = `http://localhost:${server.address().port}`;

let passed = 0;
const check = (name, cond) => {
  assert.ok(cond, `FAILED: ${name}`);
  console.log(`  ok  ${name}`);
  passed++;
};

async function login(email) {
  const r = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password' }),
  });
  const { access_token } = await r.json();
  return access_token;
}

const authed = (token) => ({ authorization: `Bearer ${token}` });

try {
  const root = await login('root@example.com');   // superadmin *:*:*
  const alice = await login('alice@example.com');  // admin (inherits manager, user)
  const bob = await login('bob@example.com');      // manager (inherits user)
  const carol = await login('carol@example.com');  // user

  // --- auth -------------------------------------------------------------
  const bad = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'carol@example.com', password: 'wrong' }),
  });
  check('login rejects bad password', bad.status === 401);
  check('login issues tokens', !!carol && !!root);

  const noAuth = await fetch(`${base}/me`);
  check('protected route rejects missing token', noAuth.status === 401);

  // --- role hierarchy ---------------------------------------------------
  const bobPerms = await (await fetch(`${base}/me/permissions`, { headers: authed(bob) })).json();
  check('manager inherits user perms (own)', bobPerms.permissions.includes('invoices:read:own'));
  check('manager has own perms (any)', bobPerms.permissions.includes('invoices:read:any'));

  // --- scope fallthrough: :any covers :own ------------------------------
  // carol (own-only) can read her own invoice but not bob's
  const carolOwn = await fetch(`${base}/invoices/inv_1`, { headers: authed(carol) });
  check('user reads own invoice', carolOwn.status === 200);
  const carolOther = await fetch(`${base}/invoices/inv_2`, { headers: authed(carol) });
  check('user blocked from others invoice', carolOther.status === 403);
  // bob (manager, :any) can read carol's invoice
  const bobOther = await fetch(`${base}/invoices/inv_1`, { headers: authed(bob) });
  check('manager reads any invoice (any covers own)', bobOther.status === 200);

  // --- list filtering ----------------------------------------------------
  const carolList = await (await fetch(`${base}/invoices`, { headers: authed(carol) })).json();
  check('user list is scoped to own', carolList.invoices.length === 1);
  const bobList = await (await fetch(`${base}/invoices`, { headers: authed(bob) })).json();
  check('manager list sees all', bobList.invoices.length === 3);

  // --- superadmin wildcard ----------------------------------------------
  const rootApprove = await fetch(`${base}/invoices/inv_1/approve`, {
    method: 'POST', headers: authed(root),
  });
  check('superadmin wildcard approves', rootApprove.status === 200);
  const carolApprove = await fetch(`${base}/invoices/inv_2/approve`, {
    method: 'POST', headers: authed(carol),
  });
  check('user cannot approve', carolApprove.status === 403);

  // --- dynamic page toggle: manager HAS approve perm but page is OFF ----
  const bobMenu1 = await (await fetch(`${base}/me/menu`, { headers: authed(bob) })).json();
  const invoicesNode = bobMenu1.menu.find((n) => n.key === 'invoices');
  const approveVisible = invoicesNode?.children?.some((c) => c.key === 'invoices.approve');
  check('disabled page hidden from menu despite permission', approveVisible === false);

  // admin re-enables the page for managers at runtime
  const toggle = await fetch(`${base}/admin/roles/r_manager/pages/pg_inv_approve`, {
    method: 'PUT', headers: { ...authed(alice), 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  check('admin can toggle page', toggle.status === 200);

  const bobMenu2 = await (await fetch(`${base}/me/menu`, { headers: authed(bob) })).json();
  const invoicesNode2 = bobMenu2.menu.find((n) => n.key === 'invoices');
  const approveVisible2 = invoicesNode2?.children?.some((c) => c.key === 'invoices.approve');
  check('page appears after enable (cache invalidated)', approveVisible2 === true);

  // --- nested access requires permission --------------------------------
  const carolMenu = await (await fetch(`${base}/me/menu`, { headers: authed(carol) })).json();
  check('user has no admin branch', !carolMenu.menu.some((n) => n.key === 'admin'));
  const aliceMenu = await (await fetch(`${base}/me/menu`, { headers: authed(alice) })).json();
  check('admin sees admin branch with children', aliceMenu.menu.some((n) => n.key === 'admin' && n.children?.length));

  // --- admin guard -------------------------------------------------------
  const carolAdmin = await fetch(`${base}/admin/pages`, { headers: authed(carol) });
  check('non-admin blocked from admin api', carolAdmin.status === 403);

  // --- runtime grant -----------------------------------------------------
  await fetch(`${base}/admin/roles/r_user/permissions`, {
    method: 'POST', headers: { ...authed(alice), 'content-type': 'application/json' },
    body: JSON.stringify({ resource: 'reports', action: 'read', scope: 'any' }),
  });
  const carolPerms = await (await fetch(`${base}/me/permissions`, { headers: authed(carol) })).json();
  check('runtime grant reflected after invalidation', carolPerms.permissions.includes('reports:read:any'));

  console.log(`\nAll ${passed} checks passed.`);
  server.close();
} catch (err) {
  console.error('\nTEST RUN FAILED:', err.message);
  server.close();
  process.exit(1);
}
