// Script de seed: genera 200 incidencias PNP con coordenadas dentro de cada polígono real
// Lee el GeoJSON de jurisdicciones para usar los límites exactos
// Uso: node prisma/seed-pnp.js

const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Ruta al GeoJSON (relativo a la raíz del backend)
const GEOJSON_PATH = path.resolve(
  __dirname,
  '../../MAP_610_NEW/public/data/juridiccion.geojson'
);

// Mapeo nombre GeoJSON → nombre DB (con tildes y mayúsculas correctas)
const NOMBRE_MAP = {
  '10 de octubre':   '10 de Octubre',
  'bayovar':         'Bayóvar',
  'caja de agua':    'Caja de Agua',
  'canto rey':       'Canto Rey',
  'huayrona':        'Huayrona',
  'mariscal caceres':'Mariscal Cáceres',
  'santa elizabeth': 'Santa Elizabeth',
  'zarate':          'Zárate',
};

const POLICIA_MAP = {
  '10 de Octubre':   'Comisaría 10 de Octubre',
  'Bayóvar':         'Comisaría de Bayóvar',
  'Caja de Agua':    'Comisaría de Caja de Agua',
  'Canto Rey':       'Comisaría de Canto Rey',
  'Huayrona':        'Comisaría de Huayrona',
  'Mariscal Cáceres':'Comisaría Mariscal Cáceres',
  'Santa Elizabeth': 'Comisaría Santa Elizabeth',
  'Zárate':          'Comisaría de Zárate',
};

const TIPOS = [
  'Robo al paso',
  'Robo agravado',
  'Microcomercialización de drogas',
  'Violencia familiar',
  'Accidente de tránsito',
  'Violencia sexual',
  'Homicidio',
  'Lesiones',
  'Hurto',
  'Otros',
];

const DESCRIPCIONES = {
  'Robo al paso':                    'Ciudadano fue víctima de robo al paso por parte de sujetos en motocicleta.',
  'Robo agravado':                   'Robo a mano armada con amenaza a la víctima en vía pública.',
  'Microcomercialización de drogas': 'Se intervino a sujeto en posesión de estupefacientes con fines de comercialización.',
  'Violencia familiar':              'Denuncia por violencia física y psicológica en el domicilio familiar.',
  'Accidente de tránsito':           'Colisión vehicular con daños materiales y lesiones leves.',
  'Violencia sexual':                'Denuncia por actos contra la libertad sexual.',
  'Homicidio':                       'Fallecimiento de persona por causa violenta, en investigación.',
  'Lesiones':                        'Persona con lesiones corporales producto de riña en vía pública.',
  'Hurto':                           'Sustracción de pertenencias sin uso de violencia.',
  'Otros':                           'Incidencia policial diversa registrada en comisaría.',
};

const TURNOS  = ['MORNING', 'AFTERNOON', 'NIGHT'];
const ESTADOS = ['INVESTIGATING', 'REFERRED', 'CLOSED'];

// ── Geometría ─────────────────────────────────────────────────────────────────

function getBoundingBox(coords) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return { minLng, maxLng, minLat, maxLat };
}

// Ray-casting: determina si un punto [lng, lat] está dentro de un polígono
function pointInPolygon(lng, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Genera un punto aleatorio DENTRO del polígono
function randomPointInPolygon(coords) {
  const bbox = getBoundingBox(coords);
  for (let attempt = 0; attempt < 200; attempt++) {
    const lng = bbox.minLng + Math.random() * (bbox.maxLng - bbox.minLng);
    const lat = bbox.minLat + Math.random() * (bbox.maxLat - bbox.minLat);
    if (pointInPolygon(lng, lat, coords)) {
      return {
        lat: parseFloat(lat.toFixed(6)),
        lng: parseFloat(lng.toFixed(6)),
      };
    }
  }
  // Fallback: centroide
  const lng = (bbox.minLng + bbox.maxLng) / 2;
  const lat = (bbox.minLat + bbox.maxLat) / 2;
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fechaAleatoria() {
  const hoy = new Date();
  const diasAtras = Math.floor(Math.random() * 28);
  const fecha = new Date(hoy);
  fecha.setDate(fecha.getDate() - diasAtras);
  fecha.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return fecha;
}

function numeroDenuncia() {
  return `2026-SJL-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Leer GeoJSON
  if (!fs.existsSync(GEOJSON_PATH)) {
    throw new Error(`No se encontró el GeoJSON en: ${GEOJSON_PATH}`);
  }
  const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf-8'));

  // 2. Extraer jurisdicciones con sus polígonos
  const jurisdicciones = [];
  for (const feature of geojson.features) {
    const nombreRaw = (feature.properties.name || '').toLowerCase().trim();
    const nombreDB  = NOMBRE_MAP[nombreRaw];
    if (!nombreDB) {
      console.warn(`⚠️  Jurisdicción no reconocida: "${feature.properties.name}" — se omite`);
      continue;
    }
    // Soporta Polygon y MultiPolygon
    let coords;
    if (feature.geometry.type === 'Polygon') {
      coords = feature.geometry.coordinates[0]; // anillo exterior
    } else if (feature.geometry.type === 'MultiPolygon') {
      // Usar el polígono más grande
      coords = feature.geometry.coordinates
        .map(p => p[0])
        .sort((a, b) => b.length - a.length)[0];
    } else {
      continue;
    }
    jurisdicciones.push({ nombre: nombreDB, coords });
  }

  console.log(`📍 Jurisdicciones encontradas: ${jurisdicciones.map(j => j.nombre).join(', ')}`);

  if (jurisdicciones.length === 0) {
    throw new Error('No se encontraron jurisdicciones válidas en el GeoJSON');
  }

  // 3. Borrar registros anteriores
  console.log('\n🗑️  Eliminando incidencias PNP anteriores...');
  const eliminados = await prisma.pnpIncidence.deleteMany({});
  console.log(`   Eliminados: ${eliminados.count} registros`);

  // 4. Generar 200 incidencias: 25 por jurisdicción (8 × 25 = 200)
  const POR_JURISDICCION = 25;
  const registros = [];

  for (const jur of jurisdicciones) {
    let generados = 0;
    while (generados < POR_JURISDICCION) {
      const coord = randomPointInPolygon(jur.coords);
      const tipo  = pick(TIPOS);
      registros.push({
        description:      DESCRIPCIONES[tipo],
        incidence_type:   tipo,
        latitude:         coord.lat,
        longitude:        coord.lng,
        jurisdiction:     jur.nombre,
        shift:            pick(TURNOS),
        complaint_number: Math.random() > 0.3 ? numeroDenuncia() : null,
        police_station:   POLICIA_MAP[jur.nombre],
        case_status:      pick(ESTADOS),
        occurred_at:      fechaAleatoria(),
      });
      generados++;
    }
    console.log(`✅ ${jur.nombre}: ${POR_JURISDICCION} incidencias generadas dentro del polígono`);
  }

  // Mezclar para no quedar agrupados por jurisdicción
  registros.sort(() => Math.random() - 0.5);

  // 5. Insertar en la DB
  console.log(`\n📤 Insertando ${registros.length} incidencias...`);
  const resultado = await prisma.pnpIncidence.createMany({
    data: registros,
    skipDuplicates: true,
  });

  console.log(`\n🎉 Seed completado: ${resultado.count} incidencias PNP insertadas correctamente.`);
}

main()
  .catch(e => {
    console.error('❌ Error en seed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
