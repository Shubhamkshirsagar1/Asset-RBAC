import { models } from '../db/index.js';

const { Task } = models;
const err = (message, status) => Object.assign(new Error(message), { status });

export const listTasks = (where) => Task.findAll({ where, order: [['title', 'ASC']] });
export const findTask = (id) => Task.findByPk(id);

export async function createTask(data) {
  if (!data.projectId || !data.title) throw err('projectId and title are required', 400);
  return Task.create({
    projectId: data.projectId,
    title: data.title,
    assigneeId: data.assigneeId ?? null,
    status: data.status ?? 'todo',
  });
}

export async function updateTask(task, data) {
  for (const f of ['title', 'assigneeId', 'status']) {
    if (data[f] !== undefined) task[f] = data[f];
  }
  await task.save();
  return task;
}

export async function completeTask(task) {
  task.status = 'done';
  await task.save();
  return task;
}
