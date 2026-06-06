import { canAccessPage } from '../services/page-access.service.js';

// Guard an API route by page key (honors dynamic enable/disable + nesting).
export function requirePage(pageKey) {
  return (req, res, next) => {
    if (!canAccessPage(req.user, pageKey)) {
      return res.status(403).json({ error: 'page disabled or not permitted', page: pageKey });
    }
    next();
  };
}
