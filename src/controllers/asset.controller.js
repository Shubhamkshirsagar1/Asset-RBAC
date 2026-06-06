import { descriptorToWhere } from '../lib/scope-where.js';
import * as svc from '../services/asset.service.js';

const h = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const listAssets = h(async (req, res) => {
  const where = descriptorToWhere(req.scope.descriptor, { ownerFields: ['assignedToUserId'], orgField: 'orgUnitId' });
  res.json({ assets: await svc.listAssets(where) });
});

export const createAsset = h(async (req, res) => res.status(201).json(await svc.createAsset(req.body ?? {})));

export const getAsset = h(async (req, res) => res.json(req.resource));

export const updateAsset = h(async (req, res) => res.json(await svc.updateAsset(req.resource, req.body ?? {})));

export const disposeAsset = h(async (req, res) => res.json(await svc.disposeAsset(req.resource)));
