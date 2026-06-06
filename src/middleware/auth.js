import { verifyToken } from '../lib/jwt.js';

// Verifies the Bearer token and attaches req.user = { userId, tenantId }.
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload = verifyToken(token);
    req.user = { userId: payload.userId, tenantId: payload.tenantId };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
