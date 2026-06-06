import { models } from '../db/index.js';

const { WorkOrder } = models;
const err = (message, status) => Object.assign(new Error(message), { status });

export const listWorkOrders = (where) => WorkOrder.findAll({ where, order: [['status', 'ASC']] });
export const findWorkOrder = (id) => WorkOrder.findByPk(id);

export async function createWorkOrder(data, userId) {
  if (!data.assetId) throw err('assetId is required', 400);
  return WorkOrder.create({
    assetId: data.assetId,
    requestedById: userId,
    cost: data.cost ?? 0,
    status: 'requested',
  });
}

export async function assignWorkOrder(wo, assigneeId) {
  if (!assigneeId) throw err('assigneeId is required', 400);
  wo.assignedToUserId = assigneeId;
  wo.status = 'assigned';
  await wo.save();
  return wo;
}

export async function approveWorkOrder(wo) {
  wo.status = 'approved';
  await wo.save();
  return wo;
}
