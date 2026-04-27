import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: 'superadmin' } });
  if (existing) {
    console.log('Usuario superadmin ya existe, omitiendo...');
    return;
  }

  const user = await prisma.user.create({
    data: {
      username: 'superadmin',
      password: bcrypt.hashSync('Admin1234!', 10),
      name: 'Super',
      lastname: 'Admin',
      rol: 'SUPERADMIN',
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  console.log('Usuario SUPERADMIN creado:', user.username);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
