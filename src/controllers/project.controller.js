import { descriptorToWhere } from '../lib/scope-where.js';
import * as svc from '../services/project.service.js';

const h = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const listProjects = h(async (req, res) => {
  const where = descriptorToWhere(req.scope.descriptor, { ownerFields: ['ownerId'], orgField: 'orgUnitId' });
  res.json({ projects: await svc.listProjects(where) });
});

export const createProject = h(async (req, res) =>
  res.status(201).json(await svc.createProject(req.body ?? {}, req.user.userId))
);

export const getProject = h(async (req, res) => res.json(req.resource));

export const updateProject = h(async (req, res) => res.json(await svc.updateProject(req.resource, req.body ?? {})));
