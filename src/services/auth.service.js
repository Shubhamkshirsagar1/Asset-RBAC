import { models } from '../db/index.js';
import { verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/jwt.js';

const { Tenant, User } = models;

export class AuthError extends Error {
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'AuthError';
    this.status = 401;
  }
}

// Login resolves the tenant by slug, then the user within that tenant.
// Runs outside any tenant context (no JWT yet), so the tenant filter is applied
// explicitly here rather than by the auto-scoping hooks.
export async function login({ tenantSlug, email, password }) {
  const tenant = await Tenant.findOne({ where: { slug: tenantSlug } });
  if (!tenant) throw new AuthError();

  const user = await User.findOne({ where: { tenantId: tenant.id, email } });
  if (!user) throw new AuthError();

  const ok = await verifyPassword(password, user.password);
  if (!ok) throw new AuthError();

  const access_token = signToken({ userId: user.id, tenantId: tenant.id });
  return {
    access_token,
    user: { id: user.id, email: user.email, tenantId: tenant.id },
  };
}
