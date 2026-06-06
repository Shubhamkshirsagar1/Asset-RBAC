import { models } from '../db/index.js';

const { Project } = models;
const err = (message, status) => Object.assign(new Error(message), { status });

export const listProjects = (where) => Project.findAll({ where, order: [['name', 'ASC']] });
export const findProject = (id) => Project.findByPk(id);

export async function createProject(data, userId) {
  if (!data.name) throw err('name is required', 400);
  return Project.create({ name: data.name, orgUnitId: data.orgUnitId ?? null, ownerId: userId });
}

export async function updateProject(project, data) {
  for (const f of ['name', 'orgUnitId']) {
    if (data[f] !== undefined) project[f] = data[f];
  }
  await project.save();
  return project;
}
