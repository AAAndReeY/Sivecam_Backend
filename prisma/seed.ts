import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function now() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
}

async function seedRoles() {
  const ALL_LAYERS = [
    'camaras','camarasVecinales','jurisdicciones','zonasCodisec',
    'paraderosAutorizados','paraderosNoAutorizados','defensaCivil','residuos',
    'sostenimiento','actividades','robos','extorsiones','homicidios',
    'feminicidios','sicariatos','secuestros','drogas','barras',
    'pnpRoboAlPaso','pnpRoboAgravado','pnpDrogas','pnpViolenciaFamiliar',
    'pnpAccidente','pnpViolenciaSexual','pnpHomicidio','pnpLesiones',
    'pnpHurto','pnpOtros','busquedaDirecciones','ubicadorPunto','rutas',
    'clusters','clusterCombinado','clusterPNP',
  ];
  const TOOLS          = ['busquedaDirecciones','ubicadorPunto','rutas','clusters','clusterCombinado'];
  const BASE_LAYERS    = ['camaras','camarasVecinales','jurisdicciones','zonasCodisec',...TOOLS];
  const SERENOS_LAYERS = [...new Set([...BASE_LAYERS,'actividades','robos','extorsiones','homicidios','feminicidios','sicariatos','secuestros','drogas','barras','clusters','clusterCombinado'])];
  const PNP_LAYERS     = [...BASE_LAYERS,'pnpRoboAlPaso','pnpRoboAgravado','pnpDrogas','pnpViolenciaFamiliar','pnpAccidente','pnpViolenciaSexual','pnpHomicidio','pnpLesiones','pnpHurto','pnpOtros','clusterPNP'];
  const ALL_MODULES    = ['camaras-municipales','camaras-vecinales','actividades','incidencias-pnp','dashboard-serenos','dashboard-pnp','auditoria','usuarios','roles'];

  const defaults = [
    {
      slug: 'rol-superadmin',    name: 'Superadmin',    system_slug: 'SUPERADMIN',
      description: 'Acceso total al sistema sin ninguna restricción',
      modules: ALL_MODULES, layers: ALL_LAYERS,
      camMunicipal: [] as string[], camVecinal: [] as string[],
    },
    {
      slug: 'rol-administrador', name: 'Administrador', system_slug: 'ADMINISTRATOR',
      description: 'Acceso completo a módulos administrativos y todas las capas',
      modules: ALL_MODULES, layers: ALL_LAYERS,
      camMunicipal: [] as string[], camVecinal: [] as string[],
    },
    {
      slug: 'rol-supervisor',    name: 'Supervisor',    system_slug: 'SUPERVISOR',
      description: 'Gestión de actividades y dashboard de serenos',
      modules: ['camaras-municipales','camaras-vecinales','actividades','dashboard-serenos'],
      layers: SERENOS_LAYERS,
      camMunicipal: ['address','buttom','megaphone'], camVecinal: ['address','neighbor','brand','mode','phone'],
    },
    {
      slug: 'rol-codisec',       name: 'CODISEC',       system_slug: 'CODISEC',
      description: 'Actividades y dashboard de serenos',
      modules: ['camaras-municipales','camaras-vecinales','actividades','dashboard-serenos'],
      layers: SERENOS_LAYERS,
      camMunicipal: ['address','buttom','megaphone'], camVecinal: ['address','neighbor'],
    },
    {
      slug: 'rol-operador',      name: 'Operador',      system_slug: 'OPERATOR',
      description: 'Acceso al mapa con capas de cámaras e incidencias',
      modules: ['camaras-municipales','camaras-vecinales'],
      layers: BASE_LAYERS,
      camMunicipal: ['address','buttom','megaphone'], camVecinal: ['address','neighbor'],
    },
    {
      slug: 'rol-visualizador',  name: 'Visualizador',  system_slug: 'VIEWER',
      description: 'Solo visualización del mapa con capas básicas',
      modules: ['camaras-municipales','camaras-vecinales'],
      layers: ['jurisdicciones','zonasCodisec','busquedaDirecciones','ubicadorPunto'],
      camMunicipal: ['address'], camVecinal: ['address'],
    },
    {
      slug: 'rol-pnp',           name: 'PNP',           system_slug: 'PNP',
      description: 'Incidencias PNP y dashboard PNP',
      modules: ['camaras-municipales','camaras-vecinales','incidencias-pnp','dashboard-pnp'],
      layers: PNP_LAYERS,
      camMunicipal: ['address','buttom','megaphone'], camVecinal: ['address','neighbor'],
    },
  ];

  const createdIds: Record<string, string> = {};

  console.log('\n▶  Creando / sincronizando roles base...\n');

  for (const def of defaults) {
    const moduleCreate = def.modules.map(m => ({
      module_key: m,
      can_create: true, can_edit: true, can_delete: true,
      visible_fields: m === 'camaras-municipales' ? def.camMunicipal
                    : m === 'camaras-vecinales'   ? def.camVecinal
                    : [],
    }));

    const existing = await prisma.customRole.findFirst({
      where: { OR: [{ system_slug: def.system_slug }, { name: def.name }] },
      select: { id: true },
    });

    if (existing) {
      await prisma.customRole.update({
        where: { id: existing.id },
        data: {
          deleted_at: null, name: def.name, system_slug: def.system_slug,
          description: def.description, updated_at: now(),
          module_permissions: { deleteMany: {}, create: moduleCreate },
          layer_permissions:  { deleteMany: {}, create: def.layers.map(l => ({ layer_key: l })) },
        },
      });
      createdIds[def.slug] = existing.id;
      console.log(`  ✔  Actualizado : ${def.name}`);
    } else {
      const created = await prisma.customRole.create({
        data: {
          name: def.name, system_slug: def.system_slug, description: def.description,
          created_at: now(), updated_at: now(),
          module_permissions: { create: moduleCreate },
          layer_permissions:  { create: def.layers.map(l => ({ layer_key: l })) },
        },
        select: { id: true },
      });
      createdIds[def.slug] = created.id;
      console.log(`  ✔  Creado      : ${def.name}`);
    }
  }

  console.log(`\n✅  Roles: ${Object.keys(createdIds).length}\n`);
}

async function seedSuperadmin() {
  const existing = await prisma.user.findUnique({ where: { username: 'superadmin' } });
  if (existing) {
    console.log('  ℹ  Usuario superadmin ya existe, omitiendo creación.');
    return;
  }
  const superadminRole = await prisma.customRole.findFirst({
    where: { system_slug: 'SUPERADMIN' },
    select: { id: true },
  });
  if (!superadminRole) throw new Error('Rol SUPERADMIN no encontrado. Ejecuta seedRoles primero.');

  await prisma.user.create({
    data: {
      username:       'superadmin',
      password:       bcrypt.hashSync('Admin1234!', 10),
      name:           'Super',
      lastname:       'Admin',
      custom_role_id: superadminRole.id,
      created_at:     now(),
      updated_at:     now(),
    },
  });
  console.log('  ✔  Usuario superadmin creado.');
}

async function main() {
  await seedRoles();
  await seedSuperadmin();
}

main()
  .catch(e => { console.error('\n❌  Error en seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
