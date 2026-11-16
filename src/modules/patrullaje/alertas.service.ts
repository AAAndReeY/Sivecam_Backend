import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { haversineM } from './geo.util';
import { MINUTOS_EN_LINEA, MovilesService } from './moviles.service';
import { PrediccionClient } from './prediccion.client';
import { turnoActual } from './turnos.util';

/**
 * Alertas automáticas del turno. Cada minuto se revisa la flota y se abren o cierran solas:
 *  - DETENIDA: móvil en servicio, sin despacho, quieta más de DETENIDA_MIN fuera de una parada de su ruta.
 *  - FUERA_JURISDICCION: móvil con ruta del turno que está en otra jurisdicción (dos revisiones seguidas).
 *  - SIN_REPORTE: radio o bodycam que estaba en línea y dejó de reportar.
 *  - JURISDICCION_SIN_MOVIL: jurisdicción sin ninguna móvil con GPS en servicio.
 * La torre puede marcarlas como atendidas; todas quedan como historial (PatrolAlert).
 */
const REVISION_MS = 60_000;
const DETENIDA_MIN = 15;
const MOVIMIENTO_M = 40; // menos que esto no cuenta como moverse (ruido del GPS)
const RADIO_PARADA_M = 150;
const SIN_REPORTE_MAX_MIN = 180; // más viejo que esto ya no es "dejó de reportar", es "apagada"

export type TipoAlerta = 'DETENIDA' | 'FUERA_JURISDICCION' | 'SIN_REPORTE' | 'JURISDICCION_SIN_MOVIL';

interface Condicion {
  key: string; // tipo + unidad o jurisdicción
  type: TipoAlerta;
  resource_type?: string;
  unit_issi?: string;
  unit_code?: string;
  jurisdiction?: string | null;
  lat?: number | null;
  lng?: number | null;
  message: string;
}

@Injectable()
export class AlertasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertasService.name);
  private timer: NodeJS.Timeout | null = null;
  private revisando = false;
  // Última posición "distinta" de cada móvil (para detectar que está detenida)
  private quietas = new Map<string, { lat: number; lng: number; desde: number }>();
  // Unidades que estaban en línea en la revisión anterior y las que cayeron (para "dejó de reportar")
  private enLineaAntes = new Set<string>();
  private cayeron = new Set<string>();
  // Fuera de jurisdicción: cuántas revisiones seguidas
  private fueraJur = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly moviles: MovilesService,
    private readonly prediccion: PrediccionClient,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.revisar(), REVISION_MS);
    setTimeout(() => void this.revisar(), 15_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async listar(horas = 24) {
    const desde = new Date(Date.now() - horas * 3600 * 1000);
    const rows = await this.prisma.patrolAlert.findMany({
      where: { OR: [{ ended_at: null }, { started_at: { gte: desde } }] },
      orderBy: { started_at: 'desc' },
      take: 500,
    });
    const ahora = Date.now();
    const conDuracion = rows.map((a) => ({
      ...a,
      duracion_s: Math.round(((a.ended_at ?? new Date(ahora)).getTime() - a.started_at.getTime()) / 1000),
      activa: !a.ended_at,
    }));
    return {
      horas,
      activas: conDuracion.filter((a) => a.activa),
      historial: conDuracion.filter((a) => !a.activa),
    };
  }

  async atender(id: string, usuario?: string) {
    const a = await this.prisma.patrolAlert.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Alerta no encontrada');
    const r = await this.prisma.patrolAlert.update({ where: { id }, data: { acknowledged_by: usuario, acknowledged_at: new Date() } });
    await this.audit.log({ action: 'ATENDER_ALERTA', entity: 'PatrolAlert', entity_id: id, changes: { tipo: a.type, unidad: a.unit_code ?? a.jurisdiction }, performed_by: usuario });
    return r;
  }

  auditar(action: string, entityId: string, changes?: Record<string, any>, usuario?: string) {
    return this.audit.log({ action, entity: 'UnitServiceStatus', entity_id: entityId, changes, performed_by: usuario });
  }

  /** Una revisión: calcula las condiciones actuales y sincroniza con las alertas abiertas en la BD. */
  async revisar() {
    if (this.revisando) return;
    this.revisando = true;
    try {
      const condiciones = await this.condiciones();
      const abiertas = await this.prisma.patrolAlert.findMany({ where: { ended_at: null } });
      const abiertasPorKey = new Map(abiertas.map((a) => [this.keyDe(a), a]));
      const ahora = new Date();
      for (const c of condiciones) {
        if (abiertasPorKey.has(c.key)) continue;
        await this.prisma.patrolAlert.create({
          data: {
            type: c.type,
            resource_type: c.resource_type,
            unit_issi: c.unit_issi,
            unit_code: c.unit_code,
            jurisdiction: c.jurisdiction ?? null,
            lat: c.lat ?? null,
            lng: c.lng ?? null,
            message: c.message,
          },
        });
      }
      const vigentes = new Set(condiciones.map((c) => c.key));
      for (const a of abiertas) {
        if (!vigentes.has(this.keyDe(a))) await this.prisma.patrolAlert.update({ where: { id: a.id }, data: { ended_at: ahora } });
      }
    } catch (e: any) {
      this.logger.warn(`Revisión de alertas falló: ${e?.message}`);
    } finally {
      this.revisando = false;
    }
  }

  private keyDe(a: { type: string; resource_type: string | null; unit_issi: string | null; jurisdiction: string | null }) {
    return a.unit_issi ? `${a.type}:${a.resource_type}:${a.unit_issi}` : `${a.type}:${a.jurisdiction}`;
  }

  private async condiciones(): Promise<Condicion[]> {
    const ahora = Date.now();
    const { shift, fecha } = turnoActual();
    const [moviles, aPie, planes, jurs] = await Promise.all([
      this.moviles.listar(),
      this.moviles.listarAPie().catch(() => []),
      this.prisma.patrolPlan.findMany({ where: { date: new Date(fecha), shift, status: 'ACTIVO' }, include: { stops: true } }),
      this.prediccion.listaJurisdicciones().catch(() => []),
    ]);
    const planPorMovil = new Map(planes.map((p) => [p.unit_issi, p]));
    const out: Condicion[] = [];

    // Dejó de reportar: estaba en línea en la revisión anterior y ahora no. La alerta sigue mientras no vuelva
    // a reportar; se olvida cuando lleva tanto sin reportar que ya cuenta como apagada.
    const todas: { key: string; tipo: string; id: string; codigo: string; en_linea: boolean; min: number | null; lat: number | null; lng: number | null; jur?: string | null }[] = [
      ...moviles.map((m) => ({ key: `MOVIL:${m.issi}`, tipo: 'MOVIL', id: m.issi, codigo: m.codigo, en_linea: m.en_linea, min: m.minutos_sin_reporte, lat: m.lat, lng: m.lng, jur: m.jurisdiccion?.nombre })),
      ...aPie.map((r) => ({ key: `${r.tipo}:${r.id}`, tipo: r.tipo, id: r.id, codigo: r.codigo, en_linea: r.en_linea, min: r.minutos_sin_reporte, lat: r.lat, lng: r.lng })),
    ];
    const enLineaAhora = new Set(todas.filter((u) => u.en_linea).map((u) => u.key));
    for (const k of this.enLineaAntes) if (!enLineaAhora.has(k)) this.cayeron.add(k);
    for (const u of todas) {
      if (!this.cayeron.has(u.key)) continue;
      if (u.en_linea || (u.min ?? Infinity) > SIN_REPORTE_MAX_MIN || u.min === null) {
        this.cayeron.delete(u.key);
        continue;
      }
      const nombre = u.tipo === 'MOVIL' ? u.codigo : `${u.tipo === 'BODYCAM' ? 'Bodycam' : 'Radio'} ${u.codigo}`;
      out.push({ key: `SIN_REPORTE:${u.key}`, type: 'SIN_REPORTE', resource_type: u.tipo, unit_issi: u.id, unit_code: u.codigo, jurisdiction: u.jur, lat: u.lat, lng: u.lng, message: `${nombre} dejó de reportar ${u.tipo === 'MOVIL' ? 'GPS ' : ''}hace ${u.min} min` });
    }
    this.enLineaAntes = enLineaAhora;

    for (const m of moviles) {
      const key = `MOVIL:${m.issi}`;
      if (!m.en_linea || m.fuera_servicio || m.lat == null || m.lng == null) {
        this.quietas.delete(key);
        this.fueraJur.delete(key);
        continue;
      }
      // Detenida fuera de una parada
      const q = this.quietas.get(key);
      if (!q || haversineM(q, m as any) > MOVIMIENTO_M) this.quietas.set(key, { lat: m.lat, lng: m.lng, desde: ahora });
      else if (!m.despacho_abierto) {
        const min = Math.round((ahora - q.desde) / 60000);
        const plan = planPorMovil.get(m.issi);
        const enParada = plan?.stops.some((s) => haversineM(s, m as any) <= RADIO_PARADA_M);
        if (min >= DETENIDA_MIN && !enParada) {
          out.push({ key: `DETENIDA:MOVIL:${m.issi}`, type: 'DETENIDA', resource_type: 'MOVIL', unit_issi: m.issi, unit_code: m.codigo, jurisdiction: m.jurisdiccion?.nombre, lat: m.lat, lng: m.lng, message: `${m.codigo} lleva ${min} min detenida fuera de una parada${plan ? ' de su ruta' : ''}` });
        }
      }
      // Fuera de su jurisdicción (la de su ruta del turno), dos revisiones seguidas y sin despacho
      const plan = planPorMovil.get(m.issi);
      if (plan?.jurisdiction_id && m.jurisdiccion && !m.jurisdiccion.aproximada && m.jurisdiccion.id !== plan.jurisdiction_id && !m.despacho_abierto) {
        const n = (this.fueraJur.get(key) ?? 0) + 1;
        this.fueraJur.set(key, n);
        if (n >= 2) {
          out.push({ key: `FUERA_JURISDICCION:MOVIL:${m.issi}`, type: 'FUERA_JURISDICCION', resource_type: 'MOVIL', unit_issi: m.issi, unit_code: m.codigo, jurisdiction: plan.jurisdiction, lat: m.lat, lng: m.lng, message: `${m.codigo} está en ${m.jurisdiccion.nombre}, fuera de ${plan.jurisdiction} (su ruta del turno)` });
        }
      } else this.fueraJur.delete(key);
    }

    // Jurisdicción sin móvil con GPS en servicio
    const conMovil = new Set(moviles.filter((m) => m.en_linea && !m.fuera_servicio).map((m) => m.jurisdiccion?.id));
    for (const j of jurs) {
      if (!conMovil.has(j.id)) {
        out.push({ key: `JURISDICCION_SIN_MOVIL:${j.nombre}`, type: 'JURISDICCION_SIN_MOVIL', jurisdiction: j.nombre, message: `${j.nombre} no tiene ninguna móvil con GPS en servicio` });
      }
    }
    return out;
  }
}
