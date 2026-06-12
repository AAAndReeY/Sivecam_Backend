import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando migración: crear tabla GpsZone...');

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "GpsZone" (
      "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
      "nombre"      TEXT          NOT NULL,
      "descripcion" TEXT,
      "geojson"     TEXT          NOT NULL,
      "color"       TEXT          NOT NULL DEFAULT '#6366f1',
      "activo"      BOOLEAN       NOT NULL DEFAULT true,
      "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at"  TIMESTAMP(3),
      CONSTRAINT "GpsZone_pkey" PRIMARY KEY ("id")
    )
  `;

  console.log('Tabla GpsZone creada (o ya existía).');

  await prisma.$executeRaw`
    ALTER TABLE "GpsZone" ADD COLUMN IF NOT EXISTS "radios_issi" TEXT NOT NULL DEFAULT '[]'
  `;

  console.log('Columna radios_issi añadida (o ya existía).');

  // Verificar que la tabla existe
  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'GpsZone'
    ) AS exists
  `;

  console.log('Verificación:', result[0]?.exists ? '✅ Tabla confirmada en la BD' : '❌ No se encontró la tabla');
}

main()
  .catch((e) => {
    console.error('Error en migración:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
