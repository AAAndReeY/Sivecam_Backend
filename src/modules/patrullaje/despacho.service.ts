import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FACTOR_VIAL, LatLng, enlacesNavegacion, haversineM, matrizHaciaDestino, rutaPorCalles } from './geo.util';
import { CamarasService } from './camaras.service';
import { MovilesService, Recurso, TipoRecurso } from './moviles.service';
import { PrediccionClient } from './prediccion.client';
import { AsignarDto } from './dto';

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

type RutaCalles = Awaited<ReturnType<typeof rutaPorCalles>>;

@Injectable()
export class DespachoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DespachoService.name);
  private timer: NodeJS.Timeout | null = null;
  private revisando = false;
  // id del despacho -> última ruta calculada y desde dónde
  private rutas = new Map<string, { at: number; desde: LatLng; ruta: RutaCalles }>();

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

  incidenciasRecientes(horas = 12) {
    return this.prediccion.incidenciasRecientes(horas);
  }

  /** Ranking de móviles para un punto: prefiltro en línea recta y luego tiempo por calles (una sola consulta). */
  async sugerir(lat: number, lng: number, user?: any) {
    const destino = { lat, lng };
    const enLinea = await this.moviles.enLinea();
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
        ocupada: !!p.m.despacho_abierto,
        recta_m: Math.round(p.recta),
        distance_m: matriz[i].distance_m,
        duration_s: matriz[i].duration_s,
        fuente: matriz[i].fuente,
      }))
      .sort((a, b) => Number(a.ocupada) - Number(b.ocupada) || a.duration_s - b.duration_s)
      .map((r, i) => ({ ...r, rank: i + 1 }));
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
      enlaces: enlacesNavegacion(destino),
      moviles_en_linea: enLinea.length,
      ranking,
      ruta_mejor: rutaMejor,
      a_pie: aPie,
      radio_a_pie_m: RADIO_A_PIE_M,
      camaras: await this.camaras.cerca(destino, user),
    };
  }

  async asignar(dto: AsignarDto, usuario?: string) {
    const tipo: TipoRecurso = dto.tipo ?? 'MOVIL';
    const movil = await this.moviles.buscarRecurso(tipo, dto.issi);
    if (!movil) throw new NotFoundException(`No se encontró el recurso ${tipo} ${dto.issi}`);
    if (movil.despacho_abierto && !dto.forzar) {
      throw new ConflictException(`${movil.codigo} ya tiene un despacho abierto`);
    }
    const d = await this.prisma.dispatch.create({
      data: {
        incident_id: dto.incident_id,
        incident_code: dto.incident_code,
        incident_type: dto.incident_type,
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
    await this.audit.log({
      action: 'DESPACHAR',
      entity: 'Dispatch',
      entity_id: d.id,
      changes: { recurso: tipo, codigo: movil.codigo, incidencia: dto.incident_code, rank: dto.rank, eta_s: dto.eta_s },
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
    const recursos = await this.recursosDe(lista);
    // Rutas por calles solo de los despachos en camino (en paralelo; cada una usa su caché)
    const rutas = await Promise.all(lista.map((d) => this.rutaDespacho(d, recursos.get(`${d.resource_type}:${d.unit_issi}`))));
    for (const id of this.rutas.keys()) if (!lista.some((d) => d.id === id && d.status === 'ASIGNADO')) this.rutas.delete(id);
    return lista.map((d, i) => this.conTiempos(d, recursos.get(`${d.resource_type}:${d.unit_issi}`), rutas[i]));
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
    const respuesta_s = d.arrived_at ? Math.round((d.arrived_at.getTime() - d.assigned_at.getTime()) / 1000) : null;
    const distancia_actual_m =
      movil?.lat != null && movil?.lng != null ? Math.round(haversineM(movil, d)) : null;
    return {
      ...d,
      respuesta_s,
      transcurrido_s: Math.round(((d.closed_at ?? new Date()).getTime() - d.assigned_at.getTime()) / 1000),
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

  async cerrar(id: string, cancelado: boolean, notas?: string, usuario?: string) {
    const d = await this.prisma.dispatch.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Despacho no encontrado');
    const r = await this.prisma.dispatch.update({
      where: { id },
      data: {
        status: cancelado ? 'CANCELADO' : 'CERRADO',
        closed_at: new Date(),
        notes: notas ? [d.notes, notas].filter(Boolean).join(' | ') : d.notes,
      },
    });
    await this.audit.log({
      action: cancelado ? 'CANCELAR_DESPACHO' : 'CERRAR_DESPACHO',
      entity: 'Dispatch',
      entity_id: id,
      changes: notas ? { notas } : undefined,
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
    return {
      horas,
      despachos: lista.length,
      con_llegada: tiempos.length,
      abiertos: lista.filter((d) => d.status === 'ASIGNADO' || d.status === 'EN_LUGAR').length,
      cancelados: lista.filter((d) => d.status === 'CANCELADO').length,
      respuesta_mediana_s: q(0.5),
      respuesta_p90_s: q(0.9),
      eligieron_primera_sugerencia: lista.filter((d) => d.rank === 1).length,
      radio_llegada_m: RADIO_LLEGADA_M,
    };
  }
}
