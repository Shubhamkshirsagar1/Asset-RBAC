import jwt from 'jsonwebtoken';
import { store } from '../db/store.js';
import { JWT_SECRET } from '../config.js';

// Verifies the Bearer token and attaches the full user to req.user.
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = store.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'unknown user' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}
