import { getMe, getPermissions } from '../services/me.service.js';
import { buildMenu } from '../services/menu.service.js';

export async function getMeHandler(req, res, next) {
  try {
    res.json(await getMe(req.user.userId));
  } catch (err) {
    next(err);
  }
}

export async function getPermissionsHandler(req, res, next) {
  try {
    res.json({ permissions: await getPermissions(req.user.userId) });
  } catch (err) {
    next(err);
  }
}

export function getContextHandler(req, res) {
  res.json({ userId: req.user.userId, tenantId: req.user.tenantId });
}

export async function getMenuHandler(req, res, next) {
  try {
    res.json({ menu: await buildMenu(req.user.userId) });
  } catch (err) {
    next(err);
  }
}
