import { models } from '../db/index.js';

const { ResourceType, Action } = models;
const err = (message, status) => Object.assign(new Error(message), { status });

export const listResourceTypes = () => ResourceType.findAll();

export async function createResourceType({ key, label }) {
  if (!key || !label) throw err('key and label are required', 400);
  return ResourceType.create({ key, label });
}

export async function deleteResourceType(id) {
  const rt = await ResourceType.findByPk(id);
  if (!rt) throw err('resource type not found', 404);
  await rt.destroy();
}

export const listActions = () => Action.findAll(); // global catalog (no tenantId)

export async function createAction({ key, label }) {
  if (!key || !label) throw err('key and label are required', 400);
  return Action.create({ key, label });
}

export async function deleteAction(id) {
  const a = await Action.findByPk(id);
  if (!a) throw err('action not found', 404);
  await a.destroy();
}
