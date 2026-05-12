import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DATA = [
  {
    name: 'PATRIMONIO (DELITO)',
    subtypes: [
      {
        name: 'HURTO',
        modalities: [
          'Hurto',
          'Hurto agravado',
          'Hurto agravado durante la noche',
          'Hurto agravado en casa habitada',
          'Hurto de uso',
          'Hurto de vehículo',
          'Hurto frustrado',
        ],
      },
      {
        name: 'ROBO',
        modalities: [
          'Asalto y robo de vehículos',
          'Robo',
          'Robo agravado',
          'Robo agravado a mano armada',
          'Robo agravado durante la noche o en lugar despoblado',
          'Robo agravado en banda',
          'Robo frustrado',
          'Tentativa de robo',
        ],
      },
      {
        name: 'ESTAFA Y OTRAS DEFRAUDACIONES',
        modalities: ['Estafa'],
      },
      {
        name: 'USURPACIÓN',
        modalities: ['Usurpación'],
      },
      {
        name: 'APROPIACIÓN ILÍCITA',
        modalities: [
          'Apropiación de prenda',
          'Apropiación ilícita común',
          'Apropiación irregular',
          'Sustracción de bien propio',
        ],
      },
      {
        name: 'EXTORSIÓN',
        modalities: ['Chantaje', 'Extorsión simple'],
      },
      {
        name: 'DELITOS INFORMÁTICOS',
        modalities: ['Delito informático'],
      },
      {
        name: 'RECEPTACIÓN',
        modalities: ['Receptación'],
      },
      {
        name: 'ABIGEATO',
        modalities: ['Hurto de ganado', 'Hurto frustrado de ganado', 'Robo de ganado'],
      },
      {
        name: 'DAÑOS',
        modalities: ['Daño simple'],
      },
    ],
  },
  {
    name: 'SEGURIDAD PÚBLICA (DELITO)',
    subtypes: [
      {
        name: 'PELIGRO COMÚN',
        modalities: [
          'Conducción en estado de ebriedad o drogadicción',
          'Daños de obras para la defensa común',
          'Estragos especiales',
          'Fabricación, suministro o tenencia de materiales peligrosos (armas, explosivos)',
          'Peligro por medio de incendio o explosión',
          'Sustracción o arrebato de armas de fuego en general',
        ],
      },
      {
        name: 'SALUD PÚBLICA',
        modalities: [
          'Adulteración de sustancias o bienes destinados a uso público',
          'Coacción al consumo de droga',
          'Comercialización o tráfico de productos nocivos',
          'Contaminación de aguas o sustancias destinadas al consumo',
          'Ejercicio ilegal de la medicina',
          'Inducción o instigación al consumo de droga',
          'Microcomercialización de drogas',
          'Posesión no punible',
          'Promoción o favorecimiento al tráfico ilícito de drogas',
          'Propagación de enfermedad peligrosa o contagiosa',
          'Tráfico ilícito de drogas',
          'Tráfico ilícito de insumos químicos y productos',
          'Uso de productos tóxicos o peligrosos',
          'Venta de medicinas adulteradas',
        ],
      },
      {
        name: 'MEDIOS DE TRANSPORTE, COMUNICACIONES Y OTROS SERVICIOS PÚBLICOS',
        modalities: [
          'Atentado contra los medios de transporte colectivo o de comunicación',
          'Atentado sobre la seguridad común',
        ],
      },
    ],
  },
  {
    name: 'VIDA, EL CUERPO Y LA SALUD (DELITO)',
    subtypes: [
      {
        name: 'LESIONES',
        modalities: [
          'Lesiones',
          'Lesiones culposas',
          'Lesiones graves',
          'Lesiones leves',
          'Lesiones leves por violencia familiar',
          'Lesiones preterintencionales con resultado fortuito',
        ],
      },
      {
        name: 'HOMICIDIO',
        modalities: [
          'Feminicidio',
          'Homicidio calificado – asesinato',
          'Homicidio culposo',
          'Homicidio por PAF',
          'Homicidio simple',
          'Parricidio',
          'Tentativa',
        ],
      },
      {
        name: 'ABORTO',
        modalities: [
          'Aborto con muerte súbita',
          'Aborto consentido',
          'Aborto preterintencional',
          'Aborto sentimental',
          'Aborto sin consentimiento',
          'Aborto terapéutico',
          'Autoaborto',
          'Tentativa',
        ],
      },
      {
        name: 'EXPOSICIÓN A PELIGRO O ABANDONO DE PERSONAS EN PELIGRO',
        modalities: [
          'Exposición o abandono peligroso',
          'Omisión de auxilio o aviso a autoridad',
          'Omisión de socorro y exposición a peligro',
        ],
      },
    ],
  },
  {
    name: 'LIBERTAD (DELITO)',
    subtypes: [
      {
        name: 'VIOLACIÓN DE LA LIBERTAD SEXUAL',
        modalities: [
          'Actos contra el pudor',
          'Actos contra el pudor de menores',
          'Seducción',
          'Tentativa de violación sexual',
          'Violación a persona en estado de inconsciencia',
          'Violación a persona en incapacidad de resistencia',
          'Violación de persona en imposibilidad de resistir',
          'Violación sexual',
          'Violación sexual de menor de 14 años',
          'Violación sexual de menor de edad seguida de muerte o lesión grave',
          'Violación sexual de persona bajo autoridad o vigilancia',
        ],
      },
      {
        name: 'VIOLACIÓN DE LA LIBERTAD PERSONAL',
        modalities: [
          'Coacción',
          'Secuestro',
          'Secuestro agravado',
          'Secuestro al paso',
          'Tentativa de secuestro',
          'Trata de personas',
        ],
      },
      {
        name: 'VIOLACIÓN DE DOMICILIO',
        modalities: ['Allanamiento ilegal de domicilio', 'Violación de domicilio'],
      },
      {
        name: 'VIOLACIÓN DE LA INTIMIDAD',
        modalities: [
          'Revelar la intimidad personal o familiar confiada',
          'Violación de la intimidad',
        ],
      },
      {
        name: 'VIOLACIÓN DE LA LIBERTAD DE TRABAJO',
        modalities: ['Atentado contra la libertad de trabajo y asociación'],
      },
      {
        name: 'PROXENETISMO',
        modalities: ['Favorecimiento de la prostitución', 'Proxenetismo'],
      },
      {
        name: 'OFENSAS AL PUDOR PÚBLICO',
        modalities: ['Exhibiciones y publicaciones obscenas', 'Pornografía infantil'],
      },
      {
        name: 'VIOLACIÓN DE LA LIBERTAD DE EXPRESIÓN',
        modalities: ['Violación de la libertad de expresión'],
      },
      {
        name: 'VIOLACIÓN DE LA LIBERTAD DE REUNIÓN',
        modalities: ['Perturbación de reunión pública'],
      },
    ],
  },
  {
    name: 'ADMINISTRACIÓN PÚBLICA (DELITO)',
    subtypes: [
      {
        name: 'COMETIDOS POR PARTICULARES',
        modalities: [
          'Atentado contra la conservación e identidad de objeto',
          'Desobediencia o resistencia a la autoridad',
          'Ejercicio ilegal de profesión',
          'Negativa a colaborar con la administración de justicia',
          'Usurpación de función pública',
          'Violencia contra autoridades elegidas',
          'Violencia contra la autoridad para impedir el ejercicio de sus funciones',
          'Violencia contra la autoridad para obligarle a algo',
        ],
      },
      {
        name: 'COMETIDOS POR FUNCIONARIOS PÚBLICOS',
        modalities: [
          'Abandono de cargo',
          'Abuso de autoridad',
          'Abuso de autoridad condicionando ilegalmente la entrega de bienes y servicios',
          'Cobro indebido',
          'Cohecho activo genérico',
          'Cohecho pasivo específico',
          'Concusión',
          'Corrupción activa de funcionario',
          'Denegación o deficiente apoyo policial',
          'Omisión, rehusamiento o demora de actos funcionales',
        ],
      },
    ],
  },
  {
    name: 'TRÁFICO ILÍCITO DE DROGAS',
    subtypes: [
      {
        name: 'LEY DE REPRESIÓN DE TID (DECRETO LEY 22095)',
        modalities: [
          'Comercializar drogas en centros educativos, asistenciales y otros',
          'Distribuir droga en pequeña cantidad directo a consumo individual',
          'Distribuir droga en pequeñas cantidades o a consumo individual',
          'Escasa cantidad de droga, materia prima para fabricación o afín',
          'Promover grupo de personas dedicadas al TID en país extranjero',
          'TID cometido en banda o en calidad de afiliado a banda',
          'TID cometido al interior de escuela o establecimiento de salud',
        ],
      },
    ],
  },
  {
    name: 'FAMILIA (DELITO)',
    subtypes: [
      {
        name: 'ATENTADOS CONTRA LA PATRIA POTESTAD',
        modalities: [
          'Inducción a la fuga de menor',
          'Instigación o participación de menor en pandillaje pernicioso',
          'Sustracción de menor',
        ],
      },
      {
        name: 'OMISIÓN DE ASISTENCIA FAMILIAR',
        modalities: [
          'Abandono de mujer gestante y en situación crítica',
          'Omisión de prestación de alimentos',
        ],
      },
    ],
  },
  {
    name: 'MENOR INFRACTOR DE LA LEY PENAL',
    subtypes: [
      {
        name: 'MENOR INFRACTOR DE LA LEY PENAL',
        modalities: ['Menor infractor de la ley penal'],
      },
    ],
  },
  {
    name: 'FE PÚBLICA (DELITO)',
    subtypes: [
      {
        name: 'FALSIFICACIÓN DE DOCUMENTOS EN GENERAL',
        modalities: [
          'Expedición de certificado médico falso',
          'Falsedad ideológica',
          'Falsificación de documentos',
          'Supresión, destrucción u ocultamiento de documentos',
        ],
      },
      {
        name: 'DISPOSICIONES COMUNES',
        modalities: ['Falsedad genérica'],
      },
      {
        name: 'FALSIFICACIÓN DE SELLOS, TIMBRES Y MARCAS OFICIALES',
        modalities: [
          'Fabricación o falsificación de marcas o contraseñas oficiales',
          'Fabricación o falsificación de sellos o timbres oficiales',
        ],
      },
    ],
  },
  {
    name: 'TRANQUILIDAD PÚBLICA (DELITO)',
    subtypes: [
      {
        name: 'CONTRA LA HUMANIDAD',
        modalities: ['Desaparición comprobada', 'Discriminación'],
      },
      {
        name: 'PAZ PÚBLICA',
        modalities: [
          'Delitos de intermediación onerosa de órganos y tejidos',
          'Disturbios',
          'Disturbios agravada',
        ],
      },
    ],
  },
];

async function main() {
  console.log('Iniciando seed de catálogo PNP...\n');

  for (const tipoData of DATA) {
    const tipo = await prisma.incidenceType.upsert({
      where: { name: tipoData.name },
      update: {},
      create: { name: tipoData.name },
    });
    console.log(`Tipo: ${tipo.name}`);

    for (const subtipoData of tipoData.subtypes) {
      const subtipo = await prisma.incidenceSubtype.upsert({
        where: { name_type_id: { name: subtipoData.name, type_id: tipo.id } },
        update: {},
        create: { name: subtipoData.name, type_id: tipo.id },
      });
      console.log(`  Subtipo: ${subtipo.name} (${subtipoData.modalities.length} modalidades)`);

      for (const modalidadName of subtipoData.modalities) {
        await prisma.incidenceModality.upsert({
          where: { name_subtype_id: { name: modalidadName, subtype_id: subtipo.id } },
          update: {},
          create: { name: modalidadName, subtype_id: subtipo.id },
        });
      }
    }
  }

  console.log('\nSeed completado exitosamente.');
}

main()
  .catch(e => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
