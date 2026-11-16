import { Injectable, Logger } from '@nestjs/common';
import { Shift } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GpsRadioService } from '../gps-radio/gps-radio.service';
import { haversineM, parseDolphinDate } from './geo.util';
import { MovilesService } from './moviles.service';
import { PatrullajeService, RADIO_VISITA_M } from './patrullaje.service';
import { PrediccionClient } from './prediccion.client';
import { clasificar, normalizarTipo } from './tipos-incidencia';
import { TURNOS, formatoLima, turnoActual, ventanaTurno } from './turnos.util';

/**
 * Supervisión y reportes (fase 4): cobertura real del turno frente a las zonas de riesgo (mapa de calor),
 * indicadores del turno y bitácora de acciones. Todo se calcula con lo ya guardado (despachos, rutas,
 * alertas, auditoría) y con el histórico GPS de Dolphin.
 */
const COBERTURA_TTL_MS = 5 * 60_000;
const MAX_PUNTOS_POR_MOVIL = 400;

const DESCRIPCION: Record<string, string> = {
  DESPACHAR: 'Despachó',
  DESPACHAR_REFUERZO: 'Envió refuerzo',
  LLEGADA_AUTOMATICA: 'Llegada detectada por GPS',
  LLEGADA_MANUAL: 'Marcó la llegada',
  CERRAR_DESPACHO: 'Cerró el despacho',
  CANCELAR_DESPACHO: 'Canceló el despacho',
  GENERAR_RUTAS: 'Generó las rutas del turno',
  CREAR_RUTA_MANUAL: 'Creó una ruta manual',
  ANULAR_RUTA: 'Anuló una ruta',
  CONFIGURAR_TIPO_INCIDENCIA: 'Cambió la prioridad de un tipo',
  FUERA_DE_SERVICIO: 'Marcó fuera de servicio',
  VUELVE_AL_SERVICIO: 'Devolvió al servicio',
  ATENDER_ALERTA: 'Atendió una alerta',
};
const ENTIDADES = ['Dispatch', 'PatrolPlan', 'IncidentTypeConfig', 'UnitServiceStatus', 'PatrolAlert'];

const mediana = (xs: number[]) => (xs.length ? Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]) : null);
const promedio = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const contar = <T>(xs: T[], clave: (x: T) => string | null | undefined) => {
  const out: Record<string, number> = {};
  for (const x of xs) {
    const k = clave(x);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

@Injectable()
export class SupervisionService {
  private readonly logger = new Logger(SupervisionService.name);
  private coberturaCache = new Map<string, { at: number; datos: any }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gps: GpsRadioService,
    private readonly moviles: MovilesService,
    private readonly patrullaje: PatrullajeService,
    private readonly prediccion: PrediccionClient,
  ) {}

  private resolver(fecha?: string, turno?: Shift) {
    const actual = turnoActual();
    const shift = turno ?? actual.shift;
    return { fecha: fecha ?? (turno && turno !== actual.shift ? actual.fecha : actual.fecha), shift };
  }

  /**
   * Dónde patrullaron de verdad las móviles con ruta en el turno (puntos GPS para el mapa de calor) y qué zonas
   * de riesgo quedaron sin pasar. Una zona cuenta como cubierta si alguna móvil pasó a RADIO_VISITA_M o menos.
   */
  async cobertura(fecha?: string, turno?: Shift) {
    const t = this.resolver(fecha, turno);
    const key = `${t.fecha}:${t.shift}`;
    const c = this.coberturaCache.get(key);
    if (c && Date.now() - c.at < COBERTURA_TTL_MS) return c.datos;

    const v = ventanaTurno(t.fecha, t.shift);
    const hasta = new Date(Math.min(v.fin.getTime(), Date.now()));
    const [planes, zonasRes] = await Promise.all([
      this.patrullaje.listarPlanes(t.fecha, t.shift),
      this.patrullaje.hotspots(t.shift, 5).catch(() => ({ rows: [] as any[] })),
    ]);
    const moviles: { codigo: string; issi: string; jurisdiccion: string | null; puntos: [number, number][]; total: number }[] = [];
    if (hasta > v.inicio) {
      const [fd, hd] = formatoLima(v.inicio).split(' ');
      const [fh, hh] = formatoLima(hasta).split(' ');
      await Promise.all(
        planes.map(async (p) => {
          try {
            const puntos = (await this.gps.findHistorico(p.unit_issi, fd, hd, fh, hh))
              .map((x: any) => ({ lat: Number(x.latitud), lng: Number(x.longitud), t: parseDolphinDate(x.fechaHora) }))
              .filter((x) => x.t && x.t >= v.inicio && x.t <= hasta);
            const paso = Math.max(1, Math.ceil(puntos.length / MAX_PUNTOS_POR_MOVIL));
            moviles.push({
              codigo: p.unit_code ?? p.unit_issi,
              issi: p.unit_issi,
              jurisdiccion: p.jurisdiction,
              puntos: puntos.filter((_, i) => i % paso === 0).map((x) => [x.lat, x.lng] as [number, number]),
              total: puntos.length,
            });
          } catch (e: any) {
            this.logger.warn(`Cobertura: sin histórico de ${p.unit_code}: ${e?.message}`);
          }
        }),
      );
    }
    const zonas = (zonasRes.rows ?? []).map((z: any) => {
      const pasaron = moviles.filter((m) => m.puntos.some(([lat, lng]) => haversineM({ lat, lng }, { lat: z.lat, lng: z.lon }) <= RADIO_VISITA_M)).map((m) => m.codigo);
      return { id: z.id, lat: z.lat, lon: z.lon, nivel: z.nivel, jurisdiccion: z.jurisdiccion, cubierta: pasaron.length > 0, moviles: pasaron };
    });
    const porJur = new Map<string, { jurisdiccion: string; zonas: number; cubiertas: number; moviles: number }>();
    for (const z of zonas) {
      const e = porJur.get(z.jurisdiccion) ?? { jurisdiccion: z.jurisdiccion, zonas: 0, cubiertas: 0, moviles: 0 };
      e.zonas++;
      if (z.cubierta) e.cubiertas++;
      porJur.set(z.jurisdiccion, e);
    }
    for (const m of moviles) if (m.jurisdiccion && porJur.has(m.jurisdiccion)) porJur.get(m.jurisdiccion)!.moviles++;
    const datos = {
      fecha: t.fecha,
      turno: t.shift,
      ventana: { inicio: v.inicio, hasta },
      en_curso: v.fin.getTime() > Date.now(),
      moviles,
      zonas,
      por_jurisdiccion: [...porJur.values()].map((e) => ({ ...e, pct: e.zonas ? Math.round((100 * e.cubiertas) / e.zonas) : null })).sort((a, b) => a.jurisdiccion.localeCompare(b.jurisdiccion)),
      zonas_total: zonas.length,
      zonas_cubiertas: zonas.filter((z) => z.cubierta).length,
      pct: zonas.length ? Math.round((100 * zonas.filter((z) => z.cubierta).length) / zonas.length) : null,
      radio_m: RADIO_VISITA_M,
    };
    this.coberturaCache.set(key, { at: Date.now(), datos });
    return datos;
  }

  /** Indicadores de un turno para el informe a la Subgerencia. */
  async indicadores(fecha?: string, turno?: Shift) {
    const t = this.resolver(fecha, turno);
    const v = ventanaTurno(t.fecha, t.shift);
    const hasta = new Date(Math.min(v.fin.getTime(), Date.now()));
    const [despachos, alertas, planes, config, flota] = await Promise.all([
      this.prisma.dispatch.findMany({ where: { assigned_at: { gte: v.inicio, lte: v.fin } }, orderBy: { assigned_at: 'asc' } }),
      this.prisma.patrolAlert.findMany({ where: { started_at: { gte: v.inicio, lte: v.fin } } }),
      this.patrullaje.listarPlanes(t.fecha, t.shift, true),
      this.prisma.incidentTypeConfig.findMany(),
      this.moviles.listar().catch(() => [] as Awaited<ReturnType<MovilesService['listar']>>),
    ]);
    const cfg = new Map(config.map((c) => [normalizarTipo(c.tipo), c]));
    const seg = (a?: Date | null, b?: Date | null) => (a && b ? (b.getTime() - a.getTime()) / 1000 : null);
    const conJur = await Promise.all(
      despachos.map(async (d) => ({
        ...d,
        jurisdiccion: (await this.prediccion.jurisdiccionDe({ lat: d.lat, lng: d.lng }).catch(() => null))?.nombre ?? 'Sin jurisdicción',
        corto: d.incident_type ? clasificar(d.incident_type, null, cfg).corto : 'Punto marcado',
      })),
    );
    const recepcion = conJur.map((d) => seg(d.incident_registered_at, d.assigned_at)).filter((s): s is number => s !== null && s >= 0);
    const llegada = conJur.map((d) => seg(d.assigned_at, d.arrived_at)).filter((s): s is number => s !== null && s >= 0);
    const enLugar = conJur.map((d) => seg(d.arrived_at, d.closed_at)).filter((s): s is number => s !== null && s >= 0);
    const activos = planes.filter((p) => p.status === 'ACTIVO');
    const paradas = activos.flatMap((p) => p.stops);
    const verificadas = paradas.filter((s) => s.checked_at);
    return {
      fecha: t.fecha,
      turno: t.shift,
      turno_nombre: TURNOS[t.shift].nombre,
      ventana: { inicio: v.inicio, fin: v.fin, hasta },
      en_curso: v.fin.getTime() > Date.now(),
      despacho: {
        unidades_despachadas: conJur.length,
        emergencias: new Set(conJur.map((d) => d.group_id ?? d.id)).size,
        con_llegada: llegada.length,
        cerrados: conJur.filter((d) => d.status === 'CERRADO').length,
        cancelados: conJur.filter((d) => d.status === 'CANCELADO').length,
        abiertos: conJur.filter((d) => d.status === 'ASIGNADO' || d.status === 'EN_LUGAR').length,
        recepcion_a_despacho: { promedio_s: promedio(recepcion), mediana_s: mediana(recepcion), n: recepcion.length },
        despacho_a_llegada: { promedio_s: promedio(llegada), mediana_s: mediana(llegada), n: llegada.length },
        en_el_lugar: { promedio_s: promedio(enLugar), n: enLugar.length },
        primera_sugerencia: conJur.filter((d) => d.rank === 1).length,
        por_jurisdiccion: contar(conJur, (d) => d.jurisdiccion),
        por_tipo: contar(conJur, (d) => d.corto),
        por_prioridad: contar(conJur, (d) => d.priority),
        por_resultado: contar(conJur, (d) => d.result),
        por_unidad: contar(conJur, (d) => d.unit_code),
      },
      rutas: {
        planes: activos.length,
        manuales: activos.filter((p) => p.source === 'MANUAL').length,
        anuladas: planes.filter((p) => p.status === 'ANULADO').length,
        paradas: paradas.length,
        verificadas: verificadas.length,
        visitadas: verificadas.filter((s) => s.visited_at).length,
        pct: verificadas.length ? Math.round((100 * verificadas.filter((s) => s.visited_at).length) / verificadas.length) : null,
        por_movil: activos.map((p) => ({
          unidad: p.unit_code,
          jurisdiccion: p.jurisdiction,
          fuente: p.source,
          paradas: p.stops.length,
          visitadas: p.stops.filter((s) => s.visited_at).length,
          verificada: p.stops.some((s) => s.checked_at),
        })),
      },
      alertas: { total: alertas.length, por_tipo: contar(alertas, (a) => a.type), atendidas: alertas.filter((a) => a.acknowledged_at).length },
      flota: {
        moviles: flota.length,
        en_linea: flota.filter((m) => m.en_linea).length,
        sin_reporte: flota.filter((m) => !m.en_linea).length,
        fuera_servicio: flota.filter((m) => m.fuera_servicio).length,
        sin_reporte_lista: flota.filter((m) => !m.en_linea).map((m) => m.codigo).sort(),
        nota: 'Estado de la flota al momento de generar el informe',
      },
      despachos: conJur.map((d) => ({
        hora: d.assigned_at,
        unidad: d.unit_code,
        incidencia: d.incident_code ?? 'Punto marcado',
        tipo: d.corto,
        prioridad: d.priority,
        jurisdiccion: d.jurisdiccion,
        recepcion_a_despacho_s: seg(d.incident_registered_at, d.assigned_at),
        despacho_a_llegada_s: seg(d.assigned_at, d.arrived_at),
        estado: d.status,
        resultado: d.result,
        por: d.assigned_by,
      })),
    };
  }

  /** Quién despachó, canceló, cerró o cambió una ruta, con hora. Filtrable por código de incidencia. */
  async bitacora(horas = 24, incidencia?: string) {
    const desde = new Date(Date.now() - horas * 3600 * 1000);
    const logs = await this.prisma.auditLog.findMany({
      where: { entity: { in: ENTIDADES }, created_at: { gte: desde } },
      orderBy: { created_at: 'desc' },
      take: 1000,
    });
    const idsDespacho = logs.filter((l) => l.entity === 'Dispatch').map((l) => l.entity_id);
    const idsPlan = logs.filter((l) => l.entity === 'PatrolPlan').map((l) => l.entity_id);
    const despachos = idsDespacho.length
      ? await this.prisma.dispatch.findMany({ where: { id: { in: idsDespacho } }, select: { id: true, unit_code: true, incident_code: true, group_id: true } })
      : [];
    const planes = idsPlan.length ? await this.prisma.patrolPlan.findMany({ where: { id: { in: idsPlan } }, select: { id: true, unit_code: true, title: true } }) : [];
    const dMap = new Map(despachos.map((d) => [d.id, d] as const));
    const pMap = new Map(planes.map((p) => [p.id, p] as const));
    const q = incidencia?.trim().toUpperCase();
    const rows = logs
      .map((l) => {
        const ch: any = l.changes ?? {};
        const d = dMap.get(l.entity_id);
        const p = pMap.get(l.entity_id);
        return {
          id: l.id,
          fecha: l.created_at,
          usuario: l.performed_by ?? 'SISTEMA',
          accion: l.action,
          descripcion: DESCRIPCION[l.action] ?? l.action,
          entidad: l.entity,
          unidad: d?.unit_code ?? p?.unit_code ?? ch.codigo ?? ch.movil ?? (l.entity === 'UnitServiceStatus' ? l.entity_id.split(':')[1] : null) ?? ch.unidad ?? null,
          incidencia: d?.incident_code ?? ch.incidencia ?? null,
          detalle: ch,
        };
      })
      .filter((r) => !q || String(r.incidencia ?? '').toUpperCase() === q || String(r.unidad ?? '').toUpperCase() === q);
    return { horas, incidencia: q ?? null, rows };
  }
}
