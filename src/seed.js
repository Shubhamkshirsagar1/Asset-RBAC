import { sequelize, models } from './db/index.js';
import { hashPassword } from './lib/password.js';

const { Tenant, User } = models;

async function main() {
  await sequelize.authenticate();
  const password = await hashPassword('password');

  const [hospital] = await Tenant.findOrCreate({
    where: { slug: 'mercy' },
    defaults: { name: 'Mercy Health', type: 'hospital' },
  });
  const [pm] = await Tenant.findOrCreate({
    where: { slug: 'acme' },
    defaults: { name: 'Acme Projects', type: 'pm' },
  });

  await User.findOrCreate({
    where: { tenantId: hospital.id, email: 'alice@mercy.test' },
    defaults: { password },
  });
  await User.findOrCreate({
    where: { tenantId: pm.id, email: 'dave@acme.test' },
    defaults: { password },
  });

  console.log('Seeded tenants: mercy (hospital), acme (pm). Password for all users: "password".');
}

main()
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error(e);
    await sequelize.close();
    process.exit(1);
  });
