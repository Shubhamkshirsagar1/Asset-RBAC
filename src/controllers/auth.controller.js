import { login } from '../services/auth.service.js';

export async function postLogin(req, res, next) {
  try {
    const { tenantSlug, email, password } = req.body ?? {};
    if (!tenantSlug || !email || !password) {
      return res.status(400).json({ error: 'tenantSlug, email and password are required' });
    }
    const result = await login({ tenantSlug, email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
