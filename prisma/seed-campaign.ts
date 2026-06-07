import { PrismaClient } from '@prisma/client';
import * as path from 'path';

const prisma = new PrismaClient();

// Datos extraídos del KML "FINAL 01" — 125 puntos de campaña municipal
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PUNTOS = require(path.join(__dirname, '_campaign_data.json'));

async function main() {
  // Crear tabla si no existe (evita tener que correr db push o SQL manual)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CampaignPoint" (
      "id"          TEXT NOT NULL,
      "name"        TEXT NOT NULL,
      "description" TEXT,
      "category"    TEXT NOT NULL,
      "lat"         DOUBLE PRECISION,
      "lng"         DOUBLE PRECISION,
      "polygon"     JSONB,
      "geom_type"   TEXT NOT NULL DEFAULT 'POINT',
      "color"       TEXT,
      "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at"  TIMESTAMP(3),
      CONSTRAINT "CampaignPoint_pkey" PRIMARY KEY ("id")
    );
  `);
  console.log('✓ Tabla CampaignPoint lista');

  await prisma.campaignPoint.deleteMany();

  const now = new Date();
  await prisma.campaignPoint.createMany({
    data: PUNTOS.map((p: any) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      polygon: p.polygon ?? undefined,
      geom_type: p.geom_type,
      color: p.color,
      created_at: now,
      updated_at: now,
    })),
  });

  const counts = await prisma.campaignPoint.groupBy({
    by: ['category'],
    _count: { id: true },
    orderBy: { category: 'asc' },
  });

  console.log('\nPuntos insertados por categoría:');
  counts.forEach(c => console.log(`  ${c.category}: ${c._count.id}`));
  console.log(`\n✓ Total: ${PUNTOS.length} puntos de campaña`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
