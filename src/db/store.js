import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// In-memory store. Mirrors the Prisma schema in /prisma/schema.prisma so you
// can swap this file for real DB queries without touching the services.
// Every read/write the services need goes through the helpers at the bottom.
// ---------------------------------------------------------------------------

const pw = (plain) => bcrypt.hashSync(plain, 10); // demo password hashing

export const db = {
  // ---- Users -------------------------------------------------------------
  users: [
    { id: 'u_root', email: 'root@example.com', passwordHash: pw('password'), attributes: {} },
    { id: 'u_alice', email: 'alice@example.com', passwordHash: pw('password'), attributes: { department: 'finance' } },
    { id: 'u_bob', email: 'bob@example.com', passwordHash: pw('password'), attributes: { department: 'finance' } },
    { id: 'u_carol', email: 'carol@example.com', passwordHash: pw('password'), attributes: { department: 'sales' } },
  ],

  // ---- Roles (with hierarchy via parentRoleId) ---------------------------
  roles: [
    { id: 'r_superadmin', name: 'superadmin', parentRoleId: null, isSystem: true },
    { id: 'r_admin', name: 'admin', parentRoleId: 'r_manager', isSystem: true },
    { id: 'r_manager', name: 'manager', parentRoleId: 'r_user', isSystem: false },
    { id: 'r_user', name: 'user', parentRoleId: null, isSystem: false },
  ],

  // ---- Permissions -------------------------------------------------------
  permissions: [
    { id: 'p_wild', resource: '*', action: '*', scope: '*' },
    { id: 'p_inv_read_own', resource: 'invoices', action: 'read', scope: 'own' },
    { id: 'p_inv_create_own', resource: 'invoices', action: 'create', scope: 'own' },
    { id: 'p_inv_update_own', resource: 'invoices', action: 'update', scope: 'own' },
    { id: 'p_inv_read_any', resource: 'invoices', action: 'read', scope: 'any' },
    { id: 'p_inv_approve_any', resource: 'invoices', action: 'approve', scope: 'any' },
    { id: 'p_rbac_manage', resource: 'rbac', action: 'manage', scope: 'any' },
    { id: 'p_users_read_any', resource: 'users', action: 'read', scope: 'any' },
  ],

  // ---- Join: which user has which roles ----------------------------------
  userRoles: [
    { userId: 'u_root', roleId: 'r_superadmin' },
    { userId: 'u_alice', roleId: 'r_admin' },
    { userId: 'u_bob', roleId: 'r_manager' },
    { userId: 'u_carol', roleId: 'r_user' },
  ],

  // ---- Join: which role has which permissions ----------------------------
  rolePermissions: [
    { roleId: 'r_superadmin', permissionId: 'p_wild' },
    { roleId: 'r_user', permissionId: 'p_inv_read_own' },
    { roleId: 'r_user', permissionId: 'p_inv_create_own' },
    { roleId: 'r_user', permissionId: 'p_inv_update_own' },
    { roleId: 'r_manager', permissionId: 'p_inv_read_any' },
    { roleId: 'r_manager', permissionId: 'p_inv_approve_any' },
    { roleId: 'r_admin', permissionId: 'p_rbac_manage' },
    { roleId: 'r_admin', permissionId: 'p_users_read_any' },
  ],

  // ---- Pages: the nested route tree --------------------------------------
  pages: [
    { id: 'pg_dashboard', key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'home', order: 0, parentId: null, requiredPermissions: [], inheritFromParent: true, isMenuItem: true },

    { id: 'pg_invoices', key: 'invoices', label: 'Invoices', path: '/invoices', icon: 'file', order: 1, parentId: null, requiredPermissions: ['invoices:read:own'], inheritFromParent: true, isMenuItem: true },
    { id: 'pg_inv_create', key: 'invoices.create', label: 'New Invoice', path: '/invoices/new', icon: 'plus', order: 0, parentId: 'pg_invoices', requiredPermissions: ['invoices:create:own'], inheritFromParent: true, isMenuItem: true },
    { id: 'pg_inv_approve', key: 'invoices.approve', label: 'Approvals', path: '/invoices/approvals', icon: 'check', order: 1, parentId: 'pg_invoices', requiredPermissions: ['invoices:approve:any'], inheritFromParent: true, isMenuItem: true },

    { id: 'pg_admin', key: 'admin', label: 'Administration', path: '/admin', icon: 'shield', order: 9, parentId: null, requiredPermissions: ['rbac:manage:any'], inheritFromParent: true, isMenuItem: true },
    { id: 'pg_admin_roles', key: 'admin.roles', label: 'Roles & Permissions', path: '/admin/roles', icon: 'key', order: 0, parentId: 'pg_admin', requiredPermissions: ['rbac:manage:any'], inheritFromParent: true, isMenuItem: true },
    { id: 'pg_admin_users', key: 'admin.users', label: 'Users', path: '/admin/users', icon: 'users', order: 1, parentId: 'pg_admin', requiredPermissions: ['users:read:any'], inheritFromParent: true, isMenuItem: true },
  ],

  // ---- Join: dynamic per-role page enable/disable ------------------------
  // Demo: the manager role HAS invoices:approve:any, but an admin has turned
  // the Approvals page OFF for managers. This proves page toggles override
  // permissions at runtime.
  rolePageAccess: [
    { roleId: 'r_manager', pageId: 'pg_inv_approve', enabled: false },
  ],

  // ---- A demo resource for ownership checks ------------------------------
  invoices: [
    { id: 'inv_1', ownerId: 'u_carol', amount: 100, status: 'draft' },
    { id: 'inv_2', ownerId: 'u_bob', amount: 250, status: 'draft' },
    { id: 'inv_3', ownerId: 'u_alice', amount: 999, status: 'draft' },
  ],
};

// ---------------------------------------------------------------------------
// Query helpers (the "repository" surface the services depend on).
// ---------------------------------------------------------------------------

export const store = {
  findUserByEmail: (email) => db.users.find((u) => u.email === email),
  findUserById: (id) => db.users.find((u) => u.id === id),
  getUserRoleIds: (userId) =>
    db.userRoles.filter((ur) => ur.userId === userId).map((ur) => ur.roleId),

  findRoleById: (id) => db.roles.find((r) => r.id === id),
  findRoleByName: (name) => db.roles.find((r) => r.name === name),

  getRolePermissionStrings: (roleId) =>
    db.rolePermissions
      .filter((rp) => rp.roleId === roleId)
      .map((rp) => {
        const p = db.permissions.find((x) => x.id === rp.permissionId);
        return `${p.resource}:${p.action}:${p.scope}`;
      }),

  getAllPages: () => db.pages,
  findPageByKey: (key) => db.pages.find((p) => p.key === key),

  getRolePageAccessForRoles: (roleIds) =>
    db.rolePageAccess.filter((a) => roleIds.includes(a.roleId)),

  findInvoiceById: (id) => db.invoices.find((i) => i.id === id),
  listInvoices: () => db.invoices,

  // ---- writes used by the admin endpoints ------------------------------
  upsertRolePageAccess: (roleId, pageId, enabled) => {
    const row = db.rolePageAccess.find((a) => a.roleId === roleId && a.pageId === pageId);
    if (row) row.enabled = enabled;
    else db.rolePageAccess.push({ roleId, pageId, enabled });
  },

  upsertPermission: (resource, action, scope = 'any') => {
    let p = db.permissions.find(
      (x) => x.resource === resource && x.action === action && x.scope === scope
    );
    if (!p) {
      p = { id: `p_${Math.random().toString(36).slice(2, 8)}`, resource, action, scope };
      db.permissions.push(p);
    }
    return p;
  },

  grantPermissionToRole: (roleId, permissionId) => {
    const exists = db.rolePermissions.find(
      (rp) => rp.roleId === roleId && rp.permissionId === permissionId
    );
    if (!exists) db.rolePermissions.push({ roleId, permissionId });
  },

  revokePermissionFromRole: (roleId, permissionId) => {
    db.rolePermissions = db.rolePermissions.filter(
      (rp) => !(rp.roleId === roleId && rp.permissionId === permissionId)
    );
  },
};
