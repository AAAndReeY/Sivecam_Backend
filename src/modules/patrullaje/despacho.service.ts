import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FACTOR_VIAL, LatLng, enlacesNavegacion, haversineM, matrizHaciaDestino, rutaPorCalles } from './geo.util';
import { CamarasService } from './camaras.service';
import { MovilesService, Recurso, TipoRecurso } from './moviles.service';
import { PrediccionClient } from './prediccion.client';
import { AsignarDto, CerrarDto, TipoIncidenciaDto } from './dto';
import { ORDEN_PRIORIDAD, clasePorDefecto, clasificar, normalizarTipo } from './tipos-incidencia';

// Llegada automática: la radio de la móvil asignada reporta a esta distancia o menos del punto.
export const RADIO_LLEGADA_M = 75;
const REVISION_MS = 20_000;
const CANDIDATAS = 8;
// Personal a pie: se buscan radios portátiles y bodycams a esta distancia (en línea recta) del punto.
export const RADIO_A_PIE_M = 800;
const VELOCIDAD_A_PIE_MS = 1.3; // ~4.7 km/h
// Ruta por calles de un despacho abierto: se recalcula cuando pasa este tiempo o la móvil se movió más de esta distancia.
const RUTA_TTL_MS = 90_000;
const RUTA_MOVIMIENTO_M = 60;
// GPS "viejo" al sugerir: la posición tiene más de estos minutos (la móvil sigue en línea, pero puede no estar ahí).
const MINUTOS_GPS_VIEJO = 5;
// Despacho atrasado: sin llegada después de 1.5 veces el tiempo estimado, y nunca antes de este mínimo.
const ATRASO_MIN_S = 10 * 60;
const TIPOS_TTL_MS = 60_000;

type RutaCalles = Awaited<ReturnType<typeof rutaPorCalles>>;
type ConfigTipos = Map<string, { corto: string; prioridad: string; categoria: string | null }>;

/** Estado de una incidencia según sus despachos: PENDIENTE (ninguno), DESPACHADA, EN_ATENCION, CERRADA. */
const estadoIncidencia = (ds: { status: string }[]) => {
  if (!ds.length) return 'PENDIENTE';
  if (ds.some((d) => d.status === 'EN_LUGAR')) return 'EN_ATENCION';
  if (ds.some((d) => d.status === 'ASIGNADO')) return 'DESPACHADA';
  return ds.some((d) => d.status === 'CERRADO') ? 'CERRADA' : 'PENDIENTE'; // solo cancelados: vuelve a pendiente
};

@Injectable()
export class DespachoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DespachoService.name);
  private timer: NodeJS.Timeout | null = null;
  private revisando = false;
  // id del despacho -> última ruta calculada y desde dónde
  private rutas = new Map<string, { at: number; desde: LatLng; ruta: RutaCalles }>();
  private tiposCache: { at: number; map: ConfigTipos } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly moviles: MovilesService,
    private readonly prediccion: PrediccionClient,
    private readonly camaras: CamarasService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.revisarLlegadas(), REVISION_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ─── Tipos de incidencia: prioridad y nombre corto ─────────────────────────
  private async configTipos(): Promise<ConfigTipos> {
    if (this.tiposCache && Date.now() - this.tiposCache.at < TIPOS_TTL_MS) return this.tiposCache.map;
    const rows = await this.prisma.incidentTypeConfig.findMany();
    const map: ConfigTipos = new Map(rows.map((r) => [normalizarTipo(r.tipo), r]));
    this.tiposCache = { at: Date.now(), map };
    return map;
  }

  /** Tipos conocidos (configurados + vistos en los últimos 3 días) con su prioridad y nombre corto. */
  async tipos() {
    const [config, recientes] = await Promise.all([
      this.prisma.incidentTypeConfig.findMany({ orderBy: { tipo: 'asc' } }),
      this.prediccion.incidenciasRecientes(72, 2000).catch(() => ({ rows: [] as any[] })),
    ]);
    const porTipo = new Map<string, { tipo: string; grupo: string | null; vistos: number }>();
    for (const r of recientes.rows ?? []) {
      const k = normalizarTipo(r.tipo);
      if (!k) continue;
      const e = porTipo.get(k) ?? { tipo: String(r.tipo).replace(/\s+/g, ' ').trim(), grupo: r.grupo ?? null, vistos: 0 };
      e.vistos++;
      porTipo.set(k, e);
    }
    const map: ConfigTipos = new Map(config.map((c) => [normalizarTipo(c.tipo), c]));
    for (const c of config) {
      const k = normalizarTipo(c.tipo);
      if (!porTipo.has(k)) porTipo.set(k, { tipo: c.tipo, grupo: null, vistos: 0 });
    }
    return [...porTipo.values()]
      .map((e) => {
        const def = clasePorDefecto(e.tipo, e.grupo);
        const fin = clasificar(e.tipo, e.grupo, map);
        return { ...e, ...fin, por_defecto: def, configurado: map.has(normalizarTipo(e.tipo)) };
      })
      .sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || b.vistos - a.vistos || a.tipo.localeCompare(b.tipo));
  }

  async guardarTipo(dto: TipoIncidenciaDto, usuario?: string) {
    const tipo = String(dto.tipo).replace(/\s+/g, ' ').trim();
    const def = clasePorDefecto(tipo);
    const data = { corto: (dto.corto ?? '').trim() || def.corto, prioridad: dto.prioridad, categoria: dto.categoria ?? def.categoria, updated_by: usuario };
    const r = await this.prisma.incidentTypeConfig.upsert({ where: { tipo }, create: { tipo, ...data }, update: data });
    this.tiposCache = null;
    await this.audit.log({ action: 'CONFIGURAR_TIPO_INCIDENCIA', entity: 'IncidentTypeConfig', entity_id: tipo, changes: data, performed_by: usuario });
    return r;
  }

  /**
   * Incidencias recientes del Sistema de Incidencias con prioridad, nombre corto y estado de atención
   * (según los despachos de SIVECAM). Pendientes primero, por prioridad y luego las más nuevas.
   */
  async incidenciasRecientes(horas = 12) {
    const [res, config] = await Promise.all([this.prediccion.incidenciasRecientes(horas), this.configTipos()]);
    const rows: any[] = res.rows ?? [];
    const ids = rows.map((r) => String(r.id));
    const despachos = ids.length
      ? await this.prisma.dispatch.findMany({
          where: { incident_id: { in: ids } },
          select: { id: true, incident_id: true, status: true, unit_code: true, group_id: true, assigned_at: true },
          orderBy: { assigned_at: 'asc' },
        })
      : [];
    const porInc = new Map<string, typeof despachos>();
    for (const d of despachos) {
      const l = porInc.get(d.incident_id!) ?? [];
      l.push(d);
      porInc.set(d.incident_id!, l);
    }
    const ORDEN_ESTADO: Record<string, number> = { PENDIENTE: 0, DESPACHADA: 1, EN_ATENCION: 1, CERRADA: 2 };
    const out = rows.map((r) => {
      const ds = porInc.get(String(r.id)) ?? [];
      const abiertos = ds.filter((d) => d.status === 'ASIGNADO' || d.status === 'EN_LUGAR');
      return {
        ...r,
        ...clasificar(r.tipo, r.grupo, config),
        estado: estadoIncidencia(ds),
        unidades: abiertos.map((d) => d.unit_code).filter(Boolean),
        group_id: abiertos[0]?.group_id ?? ds[ds.length - 1]?.group_id ?? null,
      };
    });
    out.sort(
      (a, b) =>
        ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
        ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
        String(b.registrado).localeCompare(String(a.registrado)),
    );
    return { horas, rows: out };
  }

  /** Ranking de móviles para un punto: prefiltro en línea recta y luego tiempo por calles (una sola consulta). */
  async sugerir(lat: number, lng: number, user?: any) {
    const destino = { lat, lng };
    const [enLinea, jurPunto] = await Promise.all([this.moviles.enLinea(), this.prediccion.jurisdiccionDe(destino).catch(() => null)]);
    const pre = enLinea
      .map((m) => ({ m, recta: haversineM(m, destino) }))
      .sort((a, b) => a.recta - b.recta)
      .slice(0, CANDIDATAS);
    const matriz = await matrizHaciaDestino(pre.map((p) => p.m), destino);
    const ranking = pre
      .map((p, i) => ({
        issi: p.m.issi,
        codigo: p.m.codigo,
        tipo: p.m.subtipo,
        jurisdiccion: p.m.jurisdiccion?.nombre ?? null,
        lat: p.m.lat,
        lng: p.m.lng,
        minutos_sin_reporte: p.m.minutos_sin_reporte,
        gps_viejo: (p.m.minutos_sin_reporte ?? 0) > MINUTOS_GPS_VIEJO,
        ocupada: !!p.m.despacho_abierto,
        despacho_abierto: p.m.despacho_abierto,
        otra_jurisdiccion: !!(jurPunto && p.m.jurisdiccion && p.m.jurisdiccion.id !== jurPunto.id),
        recta_m: Math.round(p.recta),
        distance_m: matriz[i].distance_m,
        duration_s: matriz[i].duration_s,
        fuente: matriz[i].fuente,
      }))
      // Libres primero; entre libres, las de GPS fresco antes que las de posición vieja; luego por tiempo por calles
      .sort((a, b) => Number(a.ocupada) - Number(b.ocupada) || Number(a.gps_viejo) - Number(b.gps_viejo) || a.duration_s - b.duration_s)
      .map((r, i) => ({ ...r, rank: i + 1, razon: this.razonSugerencia(r, i) }));
    const aPie = (await this.moviles.aPieCerca(destino, RADIO_A_PIE_M)).slice(0, 8).map((g, i) => {
      const r = g.principal;
      const calle = Math.round(r.recta_m * FACTOR_VIAL);
      return {
        rank: i + 1,
        tipo: r.tipo,
        id: r.id,
        codigo: r.codigo,
        lat: r.lat,
        lng: r.lng,
        minutos_sin_reporte: r.minutos_sin_reporte,
        ocupada: !!r.despacho_abierto,
        recta_m: r.recta_m,
        distance_m: calle,
        duration_s: Math.round(calle / VELOCIDAD_A_PIE_MS),
        // Radio + bodycam juntas = mismo sereno
        acompanante: g.acompanantes[0]
          ? { tipo: g.acompanantes[0].tipo, id: g.acompanantes[0].id, codigo: g.acompanantes[0].codigo }
          : null,
      };
    });
    // Recorrido por calles de la mejor sugerencia (una sola consulta extra), para dibujarlo en el mapa
    const mejor = ranking[0];
    const rutaMejor = mejor ? { issi: mejor.issi, ...(await rutaPorCalles([{ lat: mejor.lat, lng: mejor.lng }, destino])) } : null;
    return {
      destino,
      jurisdiccion: jurPunto ? { id: jurPunto.id, nombre: jurPunto.nombre } : null,
      enlaces: enlacesNavegacion(destino),
      moviles_en_linea: enLinea.length,
      ranking,
      ruta_mejor: rutaMejor,
      a_pie: aPie,
      radio_a_pie_m: RADIO_A_PIE_M,
      camaras: await this.camaras.cerca(destino, user),
    };
  }

  /** Una línea que explica el lugar de cada móvil en el ranking. */
  private razonSugerencia(
    r: { ocupada: boolean; gps_viejo: boolean; otra_jurisdiccion: boolean; minutos_sin_reporte: number | null; duration_s: number; fuente: string; jurisdiccion: string | null },
    i: number,
  ) {
    if (r.ocupada) return 'Ya atiende otro despacho';
    const partes: string[] = [];
    if (i === 0) partes.push('La más rápida por calles');
    else partes.push(`${Math.round(r.duration_s / 60)} min por calles`);
    if (r.gps_viejo) partes.push(`posición de hace ${r.minutos_sin_reporte} min`);
    if (r.otra_jurisdiccion) partes.push(`viene de ${r.jurisdiccion}`);
    if (r.fuente !== 'osrm') partes.push('tiempo estimado');
    return partes.join(', ');
  }

  async asignar(dto: AsignarDto, usuario?: string) {
    const tipo: TipoRecurso = dto.tipo ?? 'MOVIL';
    const movil = await this.moviles.buscarRecurso(tipo, dto.issi);
    if (!movil) throw new NotFoundException(`No se encontró el recurso ${tipo} ${dto.issi}`);
    if (movil.despacho_abierto && !dto.forzar) {
      throw new ConflictException(`${movil.codigo} ya tiene un despacho abierto`);
    }
    // Grupo: todas las unidades enviadas a la misma emergencia comparten group_id (refuerzos incluidos)
    const groupId = dto.group_id?.trim() || (dto.incident_id ? `inc-${dto.incident_id}` : randomUUID());
    const prioridad = dto.prioridad ?? (dto.incident_type ? clasificar(dto.incident_type, null, await this.configTipos()).prioridad : null);
    const d = await this.prisma.dispatch.create({
      data: {
        incident_id: dto.incident_id,
        incident_code: dto.incident_code,
        incident_type: dto.incident_type,
        incident_registered_at: dto.incident_registered_at ? new Date(dto.incident_registered_at) : null,
        priority: prioridad,
        group_id: groupId,
        reference: dto.referencia,
        lat: dto.lat,
        lng: dto.lng,
        resource_type: tipo,
        unit_issi: movil.id,
        unit_code: movil.codigo,
        rank: dto.rank,
        eta_s: dto.eta_s,
        distance_m: dto.distance_m,
        notes: dto.notas,
        assigned_by: usuario,
      },
    });
    const refuerzo = await this.prisma.dispatch.count({ where: { group_id: groupId, id: { not: d.id } } });
    await this.audit.log({
      action: refuerzo ? 'DESPACHAR_REFUERZO' : 'DESPACHAR',
      entity: 'Dispatch',
      entity_id: d.id,
      changes: { recurso: tipo, codigo: movil.codigo, incidencia: dto.incident_code, prioridad, grupo: groupId, rank: dto.rank, eta_s: dto.eta_s },
      performed_by: usuario,
    });
    return this.conTiempos(d, movil);
  }

  async listar(horas = 24) {
    const desde = new Date(Date.now() - horas * 3600 * 1000);
    const lista = await this.prisma.dispatch.findMany({
      where: { OR: [{ assigned_at: { gte: desde } }, { status: { in: ['ASIGNADO', 'EN_LUGAR'] } }] },
      orderBy: { assigned_at: 'desc' },
    });
    const [recursos, config] = await Promise.all([this.recursosDe(lista), this.configTipos()]);
    // Rutas por calles solo de los despachos en camino (en paralelo; cada una usa su caché)
    const rutas = await Promise.all(lista.map((d) => this.rutaDespacho(d, recursos.get(`${d.resource_type}:${d.unit_issi}`))));
    for (const id of this.rutas.keys()) if (!lista.some((d) => d.id === id && d.status === 'ASIGNADO')) this.rutas.delete(id);
    return lista.map((d, i) => ({
      ...this.conTiempos(d, recursos.get(`${d.resource_type}:${d.unit_issi}`), rutas[i]),
      // Nombre corto del tipo (para la tarjeta); la prioridad guardada es la del momento del despacho
      incident_corto: d.incident_type ? clasificar(d.incident_type, null, config).corto : null,
    }));
  }

  /**
   * Recorrido por calles desde la posición actual de la móvil hasta el punto, con tiempo y distancia que se
   * actualizan mientras avanza. Solo para móviles en camino; se reutiliza hasta RUTA_TTL_MS o RUTA_MOVIMIENTO_M.
   */
  private async rutaDespacho(d: any, movil?: Recurso): Promise<RutaCalles | null> {
    if (d.status !== 'ASIGNADO' || d.resource_type !== 'MOVIL' || movil?.lat == null || movil?.lng == null) return null;
    const desde = { lat: movil.lat, lng: movil.lng };
    const c = this.rutas.get(d.id);
    if (c && Date.now() - c.at < RUTA_TTL_MS && haversineM(c.desde, desde) < RUTA_MOVIMIENTO_M) return c.ruta;
    try {
      const ruta = await rutaPorCalles([desde, { lat: d.lat, lng: d.lng }]);
      this.rutas.set(d.id, { at: Date.now(), desde, ruta });
      return ruta;
    } catch {
      return c?.ruta ?? null;
    }
  }

  private conTiempos(d: any, movil?: any, ruta: RutaCalles | null = null) {
    const seg = (a?: Date | null, b?: Date | null) => (a && b ? Math.round((b.getTime() - a.getTime()) / 1000) : null);
    const ahora = new Date();
    const respuesta_s = seg(d.assigned_at, d.arrived_at);
    const distancia_actual_m =
      movil?.lat != null && movil?.lng != null ? Math.round(haversineM(movil, d)) : null;
    // Límite para avisar atraso: 1.5 veces el tiempo estimado, nunca menos de 10 min
    const limite_s = Math.max(ATRASO_MIN_S, Math.round((d.eta_s ?? 0) * 1.5));
    const transcurrido_s = seg(d.assigned_at, d.closed_at ?? ahora)!;
    return {
      ...d,
      respuesta_s,
      transcurrido_s,
      limite_s,
      atrasado: d.status === 'ASIGNADO' && transcurrido_s > limite_s,
      // Cronómetros por tramo (segundos): recepción de la incidencia -> despacho -> llegada -> cierre
      tramos: {
        recepcion_a_despacho_s: seg(d.incident_registered_at, d.assigned_at),
        despacho_a_llegada_s: respuesta_s,
        llegada_a_cierre_s: seg(d.arrived_at, d.closed_at ?? (d.status === 'EN_LUGAR' ? ahora : null)),
      },
      movil_actual: movil
        ? { lat: movil.lat, lng: movil.lng, minutos_sin_reporte: movil.minutos_sin_reporte, en_linea: movil.en_linea }
        : null,
      distancia_actual_m,
      ruta,
      enlaces: enlacesNavegacion(d),
    };
  }

  /** Posición actual de los recursos de esos despachos (solo consulta a pie si hace falta). */
  private async recursosDe(lista: { resource_type: string }[]) {
    const out = new Map<string, Recurso>();
    const moviles = await this.moviles.listar();
    for (const m of moviles) out.set(`MOVIL:${m.id}`, m);
    if (lista.some((d) => d.resource_type !== 'MOVIL')) {
      for (const r of await this.moviles.listarAPie()) out.set(`${r.tipo}:${r.id}`, r);
    }
    return out;
  }

  /** Marca la llegada cuando la radio asignada reporta dentro del radio del punto. */
  async revisarLlegadas() {
    if (this.revisando) return;
    this.revisando = true;
    try {
      const abiertos = await this.prisma.dispatch.findMany({ where: { status: 'ASIGNADO' } });
      if (!abiertos.length) return;
      const recursos = await this.recursosDe(abiertos);
      for (const d of abiertos) {
        const m = recursos.get(`${d.resource_type}:${d.unit_issi}`);
        if (!m?.lat || !m.lng || !m.ultimo_reporte) continue;
        const reporte = new Date(m.ultimo_reporte);
        if (reporte <= d.assigned_at) continue;
        if (haversineM(m as any, d) <= RADIO_LLEGADA_M) {
          await this.prisma.dispatch.update({
            where: { id: d.id },
            data: { status: 'EN_LUGAR', arrived_at: reporte },
          });
          await this.audit.log({
            action: 'LLEGADA_AUTOMATICA',
            entity: 'Dispatch',
            entity_id: d.id,
            changes: { movil: d.unit_code, respuesta_s: Math.round((reporte.getTime() - d.assigned_at.getTime()) / 1000) },
            performed_by: 'SISTEMA',
          });
        }
      }
    } catch (e: any) {
      this.logger.warn(`Revisión de llegadas falló: ${e?.message}`);
    } finally {
      this.revisando = false;
    }
  }

  async marcarLlegada(id: string, usuario?: string) {
    const d = await this.prisma.dispatch.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Despacho no encontrado');
    const r = await this.prisma.dispatch.update({
      where: { id },
      data: { status: 'EN_LUGAR', arrived_at: d.arrived_at ?? new Date() },
    });
    await this.audit.log({ action: 'LLEGADA_MANUAL', entity: 'Dispatch', entity_id: id, performed_by: usuario });
    return r;
  }

  async cerrar(id: string, cancelado: boolean, dto: CerrarDto = {}, usuario?: string) {
    const d = await this.prisma.dispatch.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Despacho no encontrado');
    if (d.status === 'CERRADO' || d.status === 'CANCELADO') throw new ConflictException('Este despacho ya está cerrado');
    const notas = dto.notas?.trim();
    const r = await this.prisma.dispatch.update({
      where: { id },
      data: {
        status: cancelado ? 'CANCELADO' : 'CERRADO',
        closed_at: new Date(),
        result: dto.resultado ?? (cancelado ? 'OTRO' : 'ATENDIDO'),
        notes: notas ? [d.notes, notas].filter(Boolean).join(' | ') : d.notes,
      },
    });
    await this.audit.log({
      action: cancelado ? 'CANCELAR_DESPACHO' : 'CERRAR_DESPACHO',
      entity: 'Dispatch',
      entity_id: id,
      changes: { movil: d.unit_code, resultado: r.result, ...(notas ? { notas } : {}) },
      performed_by: usuario,
    });
    return r;
  }

  /** Indicadores para la presentación: lo que hoy no se mide. */
  async metricas(horas = 24 * 7) {
    const desde = new Date(Date.now() - horas * 3600 * 1000);
    const lista = await this.prisma.dispatch.findMany({ where: { assigned_at: { gte: desde } } });
    const tiempos = lista
      .filter((d) => d.arrived_at)
      .map((d) => (d.arrived_at!.getTime() - d.assigned_at.getTime()) / 1000)
      .sort((a, b) => a - b);
    const q = (p: number) => (tiempos.length ? Math.round(tiempos[Math.min(tiempos.length - 1, Math.floor(p * tiempos.length))]) : null);
    const contar = (clave: (d: (typeof lista)[number]) => string | null | undefined) => {
      const out: Record<string, number> = {};
      for (const d of lista) {
        const k = clave(d);
        if (k) out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    };
    const recepcion = lista
      .filter((d) => d.incident_registered_at)
      .map((d) => (d.assigned_at.getTime() - d.incident_registered_at!.getTime()) / 1000)
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);
    return {
      horas,
      despachos: lista.length,
      emergencias: new Set(lista.map((d) => d.group_id ?? d.id)).size,
      con_llegada: tiempos.length,
      abiertos: lista.filter((d) => d.status === 'ASIGNADO' || d.status === 'EN_LUGAR').length,
      cancelados: lista.filter((d) => d.status === 'CANCELADO').length,
      respuesta_mediana_s: q(0.5),
      respuesta_p90_s: q(0.9),
      recepcion_a_despacho_mediana_s: recepcion.length ? Math.round(recepcion[Math.floor(recepcion.length / 2)]) : null,
      eligieron_primera_sugerencia: lista.filter((d) => d.rank === 1).length,
      por_resultado: contar((d) => d.result),
      por_prioridad: contar((d) => d.priority),
      radio_llegada_m: RADIO_LLEGADA_M,
    };
  }
}
