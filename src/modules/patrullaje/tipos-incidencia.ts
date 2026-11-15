// Prioridad, nombre corto y categoría de cada tipo de incidencia.
// El Sistema de Incidencias manda descripciones largas ("PRESUNTAS ACTIVIDADES CONTRA LAS BUENAS COSTUMBRES");
// el motor predictivo las agrupa (grupo). Aquí se decide cómo se ven y en qué orden se atienden.
// Lo configurado en la tabla IncidentTypeConfig manda sobre estas reglas por defecto.

export type Prioridad = 'ALTA' | 'MEDIA' | 'BAJA';
export const PRIORIDADES: Prioridad[] = ['ALTA', 'MEDIA', 'BAJA'];
export const ORDEN_PRIORIDAD: Record<Prioridad, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

export type Categoria =
  | 'PERSONA' | 'PATRIMONIO' | 'AUXILIO' | 'TRANSITO' | 'TRANQUILIDAD' | 'COSTUMBRES' | 'ORDENANZAS' | 'OTROS';
export const CATEGORIAS: Categoria[] = ['PERSONA', 'PATRIMONIO', 'AUXILIO', 'TRANSITO', 'TRANQUILIDAD', 'COSTUMBRES', 'ORDENANZAS', 'OTROS'];

export interface ClaseIncidencia {
  corto: string;
  prioridad: Prioridad;
  categoria: Categoria;
}

/** Sin tildes, mayúsculas, un solo espacio: así "CONTRA  EL PATRIMONIO" y "CONTRA EL PATRIMONIO" son el mismo tipo. */
export const normalizarTipo = (t: string | null | undefined) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

// Reglas por tipo (clave normalizada). Las prioridades son el punto de partida; la torre puede cambiarlas.
const POR_TIPO: Record<string, ClaseIncidencia> = {
  'PRESUNTAS ACTIVIDADES CONTRA LA PERSONA': { corto: 'Contra la persona', prioridad: 'ALTA', categoria: 'PERSONA' },
  'PRESUNTAS ACTIVIDADES CONTRA LA VIDA Y EL CUERPO': { corto: 'Contra la vida', prioridad: 'ALTA', categoria: 'PERSONA' },
  'PRESUNTAS ACTIVIDADES CONTRA LA VIDA EL CUERPO Y LA SALUD': { corto: 'Contra la vida y la salud', prioridad: 'ALTA', categoria: 'PERSONA' },
  'PRESUNTAS ACTIVIDADES CONTRA LA TRANQUILIDAD PUB': { corto: 'Tranquilidad pública', prioridad: 'MEDIA', categoria: 'TRANQUILIDAD' },
  'PRESUNTAS ACTIVIDADES CONTRA LA TRANQUILIDAD PUBLICA': { corto: 'Tranquilidad pública', prioridad: 'MEDIA', categoria: 'TRANQUILIDAD' },
  'PRESUNTAS ACTIVIDADES CONTRA LA LIBERTAD': { corto: 'Contra la libertad', prioridad: 'ALTA', categoria: 'PERSONA' },
  'PRESUNTAS ACTIVIDADES CONTRA EL PATRIMONIO': { corto: 'Contra el patrimonio', prioridad: 'ALTA', categoria: 'PATRIMONIO' },
  'AYUDA, AUXILIO Y RESCATE DE PERSONAS': { corto: 'Auxilio y rescate', prioridad: 'ALTA', categoria: 'AUXILIO' },
  'DESASTRES': { corto: 'Desastre', prioridad: 'ALTA', categoria: 'AUXILIO' },
  'PRESUNTOS ACCIDENTES E INFRACCIONES AL TRANSITO Y TRANSPORTE': { corto: 'Tránsito', prioridad: 'MEDIA', categoria: 'TRANSITO' },
  'PRESUNTAS ACTIVIDADES DE PERSONAS QUE AFECTAN TRANQUILIDAD Y EL ORDEN': { corto: 'Tranquilidad y orden', prioridad: 'MEDIA', categoria: 'TRANQUILIDAD' },
  'INFRAESTRUCTURA Y SERVICIOS ESENCIALES AFECTADOS': { corto: 'Infraestructura', prioridad: 'MEDIA', categoria: 'OTROS' },
  'PRESUNTAS ACTIVIDADES CONTRA LA SEG. PUBLICA': { corto: 'Seguridad pública', prioridad: 'MEDIA', categoria: 'TRANQUILIDAD' },
  'PRESUNTAS ACTIVIDADES CONTRA LA SEGURIDAD PUBLICA': { corto: 'Seguridad pública', prioridad: 'MEDIA', categoria: 'TRANQUILIDAD' },
  'ESPACIOS PUBLICOS EN RIESGO': { corto: 'Espacio público en riesgo', prioridad: 'MEDIA', categoria: 'OTROS' },
  'ESTRATEGIAS Y OPERATIVOS ESPECIALES': { corto: 'Operativo especial', prioridad: 'BAJA', categoria: 'OTROS' },
  'PRESUNTAS ACTIVIDADES AMBIENTALES': { corto: 'Ambiental', prioridad: 'BAJA', categoria: 'OTROS' },
  'PRESUNTAS ACTIVIDADES CONTRA LAS BUENAS COSTUMBRES': { corto: 'Buenas costumbres', prioridad: 'BAJA', categoria: 'COSTUMBRES' },
  'PRESUNTAS INFRACCIONES A LAS ORDENANZAS Y LICENCIAS MUNICIPALES': { corto: 'Ordenanzas', prioridad: 'BAJA', categoria: 'ORDENANZAS' },
  'APOYO A OTRAS GERENCIAS O AREAS DE LA MUNICIPALIDAD': { corto: 'Apoyo a gerencias', prioridad: 'BAJA', categoria: 'OTROS' },
  'OPERATIVO MUNICIPAL': { corto: 'Operativo municipal', prioridad: 'BAJA', categoria: 'OTROS' },
};

// Si el tipo no está arriba, se decide por el grupo del motor predictivo.
const POR_GRUPO: Record<string, { prioridad: Prioridad; categoria: Categoria }> = {
  PERSONA: { prioridad: 'ALTA', categoria: 'PERSONA' },
  PATRIMONIO: { prioridad: 'ALTA', categoria: 'PATRIMONIO' },
  AUXILIO: { prioridad: 'ALTA', categoria: 'AUXILIO' },
  TRANSITO: { prioridad: 'MEDIA', categoria: 'TRANSITO' },
  TRANQUILIDAD: { prioridad: 'MEDIA', categoria: 'TRANQUILIDAD' },
  ALCOHOL_COSTUMBRES: { prioridad: 'BAJA', categoria: 'COSTUMBRES' },
  ORDENANZAS: { prioridad: 'BAJA', categoria: 'ORDENANZAS' },
};

/** "PRESUNTAS ACTIVIDADES CONTRA ..." -> "Actividades contra ..." (sin la muletilla y con mayúscula inicial), máx. 32 letras. */
const abreviar = (tipo: string) => {
  const t = normalizarTipo(tipo).replace(/^PRESUNT[OA]S? /, '').toLowerCase();
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return s.length > 32 ? `${s.slice(0, 30).trimEnd()}…` : s || 'Incidencia';
};

/** Clase por defecto de un tipo (sin mirar la configuración guardada). */
export function clasePorDefecto(tipo: string | null | undefined, grupo?: string | null): ClaseIncidencia {
  const fijo = POR_TIPO[normalizarTipo(tipo)];
  if (fijo) return fijo;
  const g = POR_GRUPO[String(grupo ?? '')];
  return { corto: abreviar(tipo ?? ''), prioridad: g?.prioridad ?? 'MEDIA', categoria: g?.categoria ?? 'OTROS' };
}

/** Clase final: lo configurado por la torre manda sobre la regla por defecto. */
export function clasificar(
  tipo: string | null | undefined,
  grupo: string | null | undefined,
  config: Map<string, { corto: string; prioridad: string; categoria: string | null }>,
): ClaseIncidencia {
  const base = clasePorDefecto(tipo, grupo);
  const c = config.get(normalizarTipo(tipo));
  if (!c) return base;
  return {
    corto: c.corto || base.corto,
    prioridad: (PRIORIDADES as string[]).includes(c.prioridad) ? (c.prioridad as Prioridad) : base.prioridad,
    categoria: (CATEGORIAS as string[]).includes(c.categoria ?? '') ? (c.categoria as Categoria) : base.categoria,
  };
}
