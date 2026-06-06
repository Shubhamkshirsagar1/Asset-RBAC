import { Umzug, SequelizeStorage } from 'umzug';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { sequelize } from './sequelize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsPath = path.resolve(here, '../../migrations');

export const umzug = new Umzug({
  migrations: {
    glob: ['*.js', { cwd: migrationsPath }],
    // ESM resolver: dynamically import each migration file and call up/down.
    resolve: ({ name, path: filepath, context }) => ({
      name,
      up: async () => (await import(pathToFileURL(filepath).href)).up({ context }),
      down: async () => (await import(pathToFileURL(filepath).href)).down({ context }),
    }),
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const cmd = process.argv[2] === 'down' ? 'down' : 'up';
  umzug[cmd]()
    .then((applied) => {
      console.log(`Migrations ${cmd}:`, applied.map((m) => m.name));
      return sequelize.close();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
