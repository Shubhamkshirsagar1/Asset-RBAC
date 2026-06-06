import { descriptorToWhere } from '../lib/scope-where.js';
import * as svc from '../services/task.service.js';

const h = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const listTasks = h(async (req, res) => {
  const where = descriptorToWhere(req.scope.descriptor, { ownerFields: ['assigneeId'], orgField: null });
  res.json({ tasks: await svc.listTasks(where) });
});

export const createTask = h(async (req, res) => res.status(201).json(await svc.createTask(req.body ?? {})));

export const getTask = h(async (req, res) => res.json(req.resource));

export const updateTask = h(async (req, res) => res.json(await svc.updateTask(req.resource, req.body ?? {})));

export const completeTask = h(async (req, res) => res.json(await svc.completeTask(req.resource)));
