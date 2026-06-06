import { descriptorToWhere } from '../lib/scope-where.js';
import * as svc from '../services/workorder.service.js';

const h = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const listWorkOrders = h(async (req, res) => {
  const where = descriptorToWhere(req.scope.descriptor, {
    ownerFields: ['requestedById', 'assignedToUserId'],
    orgField: null,
  });
  res.json({ workOrders: await svc.listWorkOrders(where) });
});

export const createWorkOrder = h(async (req, res) =>
  res.status(201).json(await svc.createWorkOrder(req.body ?? {}, req.user.userId))
);

export const getWorkOrder = h(async (req, res) => res.json(req.resource));

export const assignWorkOrder = h(async (req, res) =>
  res.json(await svc.assignWorkOrder(req.resource, (req.body ?? {}).assigneeId))
);

export const approveWorkOrder = h(async (req, res) => res.json(await svc.approveWorkOrder(req.resource)));
