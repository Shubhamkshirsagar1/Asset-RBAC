import { models } from '../db/index.js';

const { Asset } = models;
const err = (message, status) => Object.assign(new Error(message), { status });

export const listAssets = (where) => Asset.findAll({ where, order: [['name', 'ASC']] });
export const findAsset = (id) => Asset.findByPk(id);

export async function createAsset(data) {
  if (!data.name) throw err('name is required', 400);
  return Asset.create({
    name: data.name,
    orgUnitId: data.orgUnitId ?? null,
    assignedToUserId: data.assignedToUserId ?? null,
    value: data.value ?? 0,
    status: data.status ?? 'active',
  });
}

export async function updateAsset(asset, data) {
  for (const f of ['name', 'orgUnitId', 'assignedToUserId', 'value', 'status']) {
    if (data[f] !== undefined) asset[f] = data[f];
  }
  await asset.save();
  return asset;
}

export async function disposeAsset(asset) {
  asset.status = 'disposed';
  await asset.save();
  return asset;
}
