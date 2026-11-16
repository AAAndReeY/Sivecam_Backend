import { Injectable, Logger } from '@nestjs/common';
import { BodycamService } from '../bodycam/bodycam.service';
import { GpsRadioService } from '../gps-radio/gps-radio.service';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineM, parseDolphinDate } from './geo.util';
import { PrediccionClient } from './prediccion.client';
import { formatoLima } from './turnos.util';

// La clase de cada radio (CAMIONETA / MOTO / A_PIE) la calcula GpsRadioService: tipo de Dolphin
// o, si existe, la asignación local hecha en SIVECAM (Gestión de Radios GPS > Asignar a móvil).

// En línea = reportó posición en los últimos N minutos.
export const MINUTOS_EN_LINEA = 10;
// Radio y bodycam a menos de esta distancia se consideran el mismo sereno.
const MISMO_SERENO_M = 30;

export type TipoRecurso = 'MOVIL' | 'RADIO' | 'BODYCAM';

export interface Recurso {
  tipo: TipoRecurso;
  id: string; // ISSI (radio) o código de la bodycam
  codigo: string;
  subtipo: string;
  lat: number | null;
  lng: number | null;
  ultimo_reporte: string | null;
  minutos_sin_reporte: number | null;
  en_linea: boolean;
  despacho_abierto: string | null;
  // Marcado por la torre: no se sugiere ni recibe ruta hasta que vuelva al servicio
  fuera_servicio: boolean;
  fuera_servicio_motivo: string | null;
}

export interface Movil extends Recurso {
  issi: string;
  tipo: 'MOVIL';
  velocidad: number;
  estado_radio: string;
  jurisdiccion: { id: number; nombre: string; aproximada: boolean } | null;
}

const minutosDesde = (d: Date | null, ahora: number) =>
  d ? Math.max(0, Math.round((ahora - d.getTime()) / 60000)) : null;
const coordValida = (lat: any, lng: any) =>
  lat != null && lng != null && Number(lat) !== 0 && Math.abs(Number(lat)) < 90 && Math.abs(Number(lng)) < 180;

@Injectable()
export class MovilesService {
  private readonly logger = new Logger(MovilesService.name);

  constructor(
    private readonly gps: GpsRadioService,
    private readonly bodycams: BodycamService,
    private readonly prisma: PrismaService,
    private readonly prediccion: PrediccionClient,
  ) {}

  private async despachosAbiertos() {
    const abiertos = await this.prisma.dispatch.findMany({
      where: { status: { in: ['ASIGNADO', 'EN_LUGAR'] } },
      select: { id: true, unit_issi: true, resource_type: true },
    });
    return new Map(abiertos.map((d) => [`${d.resource_type}:${d.unit_issi}`, d.id]));
  }

  private async fueraDeServicio() {
    const rows = await this.prisma.unitServiceStatus.findMany({ where: { fuera_servicio: true } });
    return new Map(rows.map((r) => [r.key, r.motivo ?? '']));
  }

  /** Marca o quita "fuera de servicio" (taller, sin combustible, sin personal, etc.). */
  async marcarServicio(tipo: TipoRecurso, id: string, fuera: boolean, motivo?: string, usuario?: string) {
    const key = `${tipo}:${id}`;
    const data = { fuera_servicio: fuera, motivo: fuera ? motivo?.trim() || null : null, updated_by: usuario };
    return this.prisma.unitServiceStatus.upsert({ where: { key }, create: { key, ...data }, update: data });
  }

  /**
   * Recorrido reciente de una unidad (últimas `horas`): histórico GPS de Dolphin para radios,
   * ubicaciones de la API de bodycams para bodycams. Puntos [{ lat, lng, t, velocidad }] en orden cronológico.
   */
  async recorrido(tipo: TipoRecurso, id: string, desde: Date, hasta: Date) {
    if (tipo === 'BODYCAM') {
      const r = await this.bodycams.findUbicaciones(id, desde.toISOString(), hasta.toISOString(), '5000');
      const rows: any[] = Array.isArray(r) ? r : r?.ubicaciones ?? r?.data ?? [];
      return rows
        .map((u) => ({ lat: Number(u.latitud ?? u.lat), lng: Number(u.longitud ?? u.lng ?? u.lon), t: new Date(u.fecha ?? u.timestamp ?? u.created_at), velocidad: null as number | null }))
        .filter((u) => coordValida(u.lat, u.lng) && !Number.isNaN(u.t.getTime()))
        .sort((a, b) => a.t.getTime() - b.t.getTime());
    }
    const [fd, hd] = formatoLima(desde).split(' ');
    const [fh, hh] = formatoLima(hasta).split(' ');
    return (await this.gps.findHistorico(id, fd, hd, fh, hh))
      .map((p: any) => ({ lat: Number(p.latitud), lng: Number(p.longitud), t: parseDolphinDate(p.fechaHora), velocidad: Number(p.velocidad) || 0 }))
      .filter((p) => p.t && coordValida(p.lat, p.lng)) as { lat: number; lng: number; t: Date; velocidad: number | null }[];
  }

  // ─── Móviles (radio TETRA fija en el vehículo) ─────────────────────────────
  async listar(): Promise<Movil[]> {
    const [radios, abiertos, fuera] = await Promise.all([this.gps.findAllIncludingOffline(), this.despachosAbiertos(), this.fueraDeServicio()]);
    const ahora = Date.now();
    const out: Movil[] = [];
    for (const r of radios) {
      if (!r.es_movil) continue; // vehículo por tipo de Dolphin o por asignación local
      const fecha = parseDolphinDate(r.fechaHora);
      const valida = coordValida(r.latitud, r.longitud);
      const minutos = minutosDesde(fecha, ahora);
      const issi = String(r.issi);
      const lat = valida ? Number(r.latitud) : null;
      const lng = valida ? Number(r.longitud) : null;
      out.push({
        tipo: 'MOVIL',
        id: issi,
        issi,
        codigo: String(r.unicocodigo ?? '').trim() || `ISSI ${issi}`,
        subtipo: r.clase === 'MOTO' ? 'MOTO' : 'CAMION',
        lat,
        lng,
        velocidad: Number(r.velocidad) || 0,
        estado_radio: r.estado,
        ultimo_reporte: fecha ? fecha.toISOString() : null,
        minutos_sin_reporte: minutos,
        en_linea: valida && minutos !== null && minutos <= MINUTOS_EN_LINEA,
        despacho_abierto: abiertos.get(`MOVIL:${issi}`) ?? null,
        fuera_servicio: fuera.has(`MOVIL:${issi}`),
        fuera_servicio_motivo: fuera.get(`MOVIL:${issi}`) ?? null,
        jurisdiccion: lat != null && lng != null ? await this.prediccion.jurisdiccionDe({ lat, lng }) : null,
      });
    }
    return out.sort((a, b) => (a.minutos_sin_reporte ?? 1e12) - (b.minutos_sin_reporte ?? 1e12));
  }

  /** Móviles con GPS reciente y en servicio: las únicas que se sugieren y reciben ruta. */
  async enLinea(): Promise<(Movil & { lat: number; lng: number })[]> {
    return (await this.listar()).filter((m) => m.en_linea && !m.fuera_servicio) as any;
  }

  async buscar(issi: string): Promise<Movil | undefined> {
    return (await this.listar()).find((m) => m.issi === String(issi));
  }

  // ─── Personal a pie: radios portátiles (Dolphin) y bodycams ───────────────
  async listarAPie(): Promise<Recurso[]> {
    const ahora = Date.now();
    const [radios, cams, abiertos, fuera] = await Promise.all([
      this.gps.findAllIncludingOffline(),
      this.bodycams.findAll().catch((e) => {
        this.logger.warn(`Bodycams no disponibles: ${e?.message}`);
        return [] as any[];
      }),
      this.despachosAbiertos(),
      this.fueraDeServicio(),
    ]);
    const out: Recurso[] = [];
    for (const r of radios) {
      if (r.clase !== 'A_PIE') continue; // radio portátil por tipo de Dolphin o por asignación local
      const fecha = parseDolphinDate(r.fechaHora);
      const valida = coordValida(r.latitud, r.longitud);
      const minutos = minutosDesde(fecha, ahora);
      const issi = String(r.issi);
      out.push({
        tipo: 'RADIO',
        id: issi,
        codigo: String(r.unicocodigo ?? '').trim() || `Radio ${issi}`,
        subtipo: 'Radio portátil',
        lat: valida ? Number(r.latitud) : null,
        lng: valida ? Number(r.longitud) : null,
        ultimo_reporte: fecha ? fecha.toISOString() : null,
        minutos_sin_reporte: minutos,
        en_linea: valida && minutos !== null && minutos <= MINUTOS_EN_LINEA,
        despacho_abierto: abiertos.get(`RADIO:${issi}`) ?? null,
        fuera_servicio: fuera.has(`RADIO:${issi}`),
        fuera_servicio_motivo: fuera.get(`RADIO:${issi}`) ?? null,
      });
    }
    for (const b of cams) {
      if (!b.activa) continue;
      const fecha = b.ultima_ubicacion ? new Date(b.ultima_ubicacion) : null;
      const valida = coordValida(b.latitud, b.longitud);
      const minutos = minutosDesde(fecha, ahora);
      const id = String(b.codigo);
      out.push({
        tipo: 'BODYCAM',
        id,
        codigo: String(b.nombre ?? '').trim() || `Bodycam ${id.slice(0, 6)}`,
        subtipo: 'Bodycam',
        lat: valida ? Number(b.latitud) : null,
        lng: valida ? Number(b.longitud) : null,
        ultimo_reporte: fecha ? fecha.toISOString() : null,
        minutos_sin_reporte: minutos,
        en_linea: valida && minutos !== null && minutos <= MINUTOS_EN_LINEA,
        despacho_abierto: abiertos.get(`BODYCAM:${id}`) ?? null,
        fuera_servicio: fuera.has(`BODYCAM:${id}`),
        fuera_servicio_motivo: fuera.get(`BODYCAM:${id}`) ?? null,
      });
    }
    return out;
  }

  /** Cualquier recurso por tipo e id (para asignar y para detectar la llegada). */
  async buscarRecurso(tipo: TipoRecurso, id: string): Promise<Recurso | undefined> {
    if (tipo === 'MOVIL') return this.buscar(id);
    return (await this.listarAPie()).find((r) => r.tipo === tipo && r.id === String(id));
  }

  /**
   * Personal a pie en línea cerca de un punto. Si una radio y una bodycam están a menos de 30 m entre sí
   * se muestran juntas (es el mismo sereno): así la lista no se duplica.
   */
  async aPieCerca(p: { lat: number; lng: number }, radioM: number) {
    const cerca = (await this.listarAPie())
      .filter((r) => r.en_linea && !r.fuera_servicio && r.lat != null && r.lng != null)
      .map((r) => ({ ...r, recta_m: Math.round(haversineM(p, r as any)) }))
      .filter((r) => r.recta_m <= radioM)
      .sort((a, b) => a.recta_m - b.recta_m);
    const grupos: { principal: (typeof cerca)[number]; acompanantes: (typeof cerca)[number][] }[] = [];
    for (const r of cerca) {
      const g = grupos.find(
        (x) => x.principal.tipo !== r.tipo && !x.acompanantes.length && haversineM(x.principal as any, r as any) <= MISMO_SERENO_M,
      );
      if (g) g.acompanantes.push(r);
      else grupos.push({ principal: r, acompanantes: [] });
    }
    return grupos;
  }

  /** Resumen para la presentación. */
  async resumen() {
    const [todas, aPie] = await Promise.all([this.listar(), this.listarAPie()]);
    const porTipo: Record<string, { total: number; en_linea: number }> = {};
    for (const m of todas) {
      porTipo[m.subtipo] ??= { total: 0, en_linea: 0 };
      porTipo[m.subtipo].total++;
      if (m.en_linea) porTipo[m.subtipo].en_linea++;
    }
    const cuenta = (t: TipoRecurso) => {
      const l = aPie.filter((r) => r.tipo === t);
      return { total: l.length, en_linea: l.filter((r) => r.en_linea).length };
    };
    return {
      total: todas.length,
      en_linea: todas.filter((m) => m.en_linea).length,
      sin_reporte_mas_de_un_dia: todas.filter((m) => (m.minutos_sin_reporte ?? Infinity) > 1440).length,
      por_tipo: porTipo,
      a_pie: { radios: cuenta('RADIO'), bodycams: cuenta('BODYCAM') },
      minutos_en_linea: MINUTOS_EN_LINEA,
    };
  }
}
