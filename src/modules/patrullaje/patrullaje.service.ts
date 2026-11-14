import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Shift } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GpsRadioService } from '../gps-radio/gps-radio.service';
import { LatLng, haversineM, ordenarParadas, parseDolphinDate, rutaPorCalles } from './geo.util';
import { MovilesService } from './moviles.service';
import { PrediccionClient } from './prediccion.client';
import { TURNOS, formatoLima, turnoActual, ventanaTurno } from './turnos.util';
import { GenerarRutasDto, RutaManualDto } from './dto';

// Una parada cuenta como visitada si la radio estuvo a esta distancia o menos.
// Dolphin reporta cada ~60 s: a 30 km/h eso son ~500 m, por eso el radio no puede ser muy chico.
export const RADIO_VISITA_M = 120;
// Brecha máxima entre dos reportes para sumar tiempo de permanencia.
const BRECHA_MAX_S = 180;

const incluirParadas = { stops: { orderBy: { order: 'asc' as const } } };

@Injectable()
export class PatrullajeService {
  private readonly logger = new Logger(PatrullajeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gps: GpsRadioService,
    private readonly moviles: MovilesService,
    private readonly prediccion: PrediccionClient,
  ) {}

  private resolverTurno(turno?: Shift, fecha?: string) {
    const actual = turnoActual();
    return { shift: turno ?? actual.shift, fecha: fecha ?? actual.fecha };
  }

  async estado() {
    const actual = turnoActual();
    const [motor, moviles] = await Promise.all([
      this.prediccion.estado().catch(() => null),
      this.moviles.resumen(),
    ]);
    return {
      turno_actual: { ...actual, ...TURNOS[actual.shift] },
      turnos: TURNOS,
      motor_predictivo: motor,
      moviles,
      radio_visita_m: RADIO_VISITA_M,
    };
  }

  /** Zonas de riesgo del turno repartidas por jurisdicción (`porJurisdiccion` zonas en cada una), para el mapa. */
  async hotspots(turno?: Shift, porJurisdiccion = 5) {
    const shift = turno ?? turnoActual().shift;
    const jurs = await this.prediccion.listaJurisdicciones();
    const partes = await Promise.all(
      jurs.map((j) =>
        this.prediccion
          .hotspots({ turno: TURNOS[shift].clave, top: porJurisdiccion, jurisdiccionId: j.id })
          .then((r) => r.rows)
          .catch(() => []),
      ),
    );
    return { turno: shift, por_jurisdiccion: porJurisdiccion, rows: partes.flat() };
  }

  jurisdicciones() {
    return this.prediccion.jurisdiccionesGeojson();
  }

  async listarPlanes(fecha?: string, turno?: Shift, todos = false) {
    const t = this.resolverTurno(turno, fecha);
    return this.prisma.patrolPlan.findMany({
      where: {
        date: new Date(t.fecha),
        shift: t.shift,
        ...(todos ? {} : { status: 'ACTIVO' as const }),
      },
      include: incluirParadas,
      orderBy: [{ jurisdiction: 'asc' }, { source: 'desc' }, { unit_code: 'asc' }],
    });
  }

  // ─── Ruta inteligente ──────────────────────────────────────────────────────
  async generar(dto: GenerarRutasDto, usuario?: string) {
    const { shift, fecha } = this.resolverTurno(dto.turno, dto.fecha);
    const paradas = dto.paradas_por_movil ?? 6;
    const permanencia = dto.permanencia_min ?? 10;

    // Las móviles con ruta MANUAL activa en este turno la conservan (la orden tiene prioridad).
    const conManual = new Set(
      (
        await this.prisma.patrolPlan.findMany({
          where: { date: new Date(fecha), shift, source: 'MANUAL', status: 'ACTIVO' },
          select: { unit_issi: true },
        })
      ).map((p) => p.unit_issi),
    );
    const moviles = (await this.moviles.enLinea()).filter(
      (m) => !conManual.has(m.issi) && (!dto.issis?.length || dto.issis.includes(m.issi)),
    );
    if (!moviles.length) {
      throw new BadRequestException('No hay móviles con GPS en línea (o todas tienen ruta manual) para generar rutas');
    }

    // Cada móvil patrulla SU jurisdicción: la del polígono (GeoJSON) donde está ahora.
    const porJur = new Map<number, typeof moviles>();
    for (const m of moviles) {
      if (!m.jurisdiccion) continue;
      porJur.set(m.jurisdiccion.id, [...(porJur.get(m.jurisdiccion.id) ?? []), m]);
    }
    if (!porJur.size) throw new BadRequestException('No se pudo ubicar a las móviles en una jurisdicción (motor predictivo sin conexión)');

    // Zonas de riesgo del turno, pedidas por jurisdicción (el nivel alto/medio/bajo es relativo a esa jurisdicción).
    const asignadas = new Map<string, any[]>(moviles.map((m) => [m.issi, []]));
    let hs: { version: number; origen: string } = { version: 0, origen: '' };
    let zonasMotor = 0;
    for (const [jurId, ms] of porJur) {
      const r = await this.prediccion.hotspots({
        turno: TURNOS[shift].clave,
        top: Math.min(200, Math.ceil(ms.length * paradas * 1.5)),
        minDistM: 350,
        jurisdiccionId: jurId,
      });
      hs = r;
      zonasMotor += r.rows.length;
      // Algo de aleatoriedad (±15 %) para que la ruta no sea 100 % predecible entre días parecidos.
      const candidatos = r.rows
        .map((h) => ({ ...h, lng: h.lon, prioridad: h.esperadas * (0.85 + 0.3 * Math.random()) }))
        .sort((a, b) => b.prioridad - a.prioridad);
      // Dentro de la jurisdicción: cada zona (de mayor a menor riesgo) va a la móvil más cercana con cupo.
      for (const z of candidatos) {
        let mejor: (typeof moviles)[number] | null = null;
        let dMin = Infinity;
        for (const m of ms) {
          if (asignadas.get(m.issi)!.length >= paradas) continue;
          const d = haversineM(m, z);
          if (d < dMin) {
            dMin = d;
            mejor = m;
          }
        }
        if (!mejor) break;
        asignadas.get(mejor.issi)!.push(z);
      }
    }
    const todas = await this.prediccion.listaJurisdicciones().catch((): { id: number; nombre: string }[] => []);
    // Jurisdicciones sin ninguna móvil con GPS (las que solo tienen móviles con ruta manual no cuentan como vacías).
    const conMovil = new Set((await this.moviles.enLinea()).map((m) => m.jurisdiccion?.id));
    const sinMovil = todas.filter((j) => !conMovil.has(j.id)).map((j) => j.nombre);

    const creados: any[] = [];
    for (const m of moviles) {
      const zonas = asignadas.get(m.issi)!;
      if (!zonas.length) continue;
      const orden = ordenarParadas<LatLng & any>({ lat: m.lat, lng: m.lng }, zonas);
      const ruta = await rutaPorCalles([{ lat: m.lat, lng: m.lng }, ...orden]);
      const plan = await this.prisma.$transaction(async (tx) => {
        await tx.patrolPlan.updateMany({
          where: { date: new Date(fecha), shift, unit_issi: m.issi, source: 'AUTO', status: 'ACTIVO' },
          data: { status: 'REEMPLAZADO' },
        });
        return tx.patrolPlan.create({
          data: {
            date: new Date(fecha),
            shift,
            source: 'AUTO',
            unit_issi: m.issi,
            unit_code: m.codigo,
            unit_type: m.subtipo,
            jurisdiction_id: m.jurisdiccion?.id,
            jurisdiction: m.jurisdiccion?.nombre,
            title: `Ruta inteligente ${TURNOS[shift].clave.toLowerCase()} – ${m.codigo}`,
            route: ruta.geometry as Prisma.InputJsonValue,
            distance_m: ruta.distance_m,
            duration_s: ruta.duration_s,
            model_version: `motor v${hs.version} · datos al ${hs.origen}`,
            created_by: usuario,
            stops: {
              create: orden.map((z, i) => ({
                order: i + 1,
                lat: z.lat,
                lng: z.lng,
                cell_id: z.id,
                level: z.nivel,
                reason: `${z.mensaje} (≈${z.esperadas} incidencias esperadas en el turno)`,
                dwell_min: permanencia,
              })),
            },
          },
          include: incluirParadas,
        });
      });
      creados.push({ ...plan, ruta_fuente: ruta.fuente });
    }

    await this.audit.log({
      action: 'GENERAR_RUTAS',
      entity: 'PatrolPlan',
      entity_id: `${fecha}/${shift}`,
      changes: { moviles: creados.length, paradas_por_movil: paradas, zonas_motor: zonasMotor, jurisdicciones_sin_movil: sinMovil },
      performed_by: usuario,
    });
    return {
      fecha,
      turno: shift,
      moviles_en_linea: moviles.length,
      moviles_con_ruta_manual: conManual.size,
      jurisdicciones_sin_movil: sinMovil,
      planes: creados,
    };
  }

  // ─── Ruta manual (orden de subgerencia / alcaldía) ─────────────────────────
  async crearManual(dto: RutaManualDto, usuario?: string) {
    const { shift, fecha } = this.resolverTurno(dto.turno, dto.fecha);
    const movil = await this.moviles.buscar(dto.issi);
    if (!movil) throw new NotFoundException(`No existe una radio de vehículo con ISSI ${dto.issi}`);

    let paradas = dto.paradas.map((p) => ({ ...p }));
    const inicio = movil.lat != null && movil.lng != null ? { lat: movil.lat, lng: movil.lng } : null;
    if (dto.optimizar_orden) paradas = ordenarParadas(inicio ?? paradas[0], paradas);
    const ruta = await rutaPorCalles(inicio ? [inicio, ...paradas] : paradas);

    const plan = await this.prisma.$transaction(async (tx) => {
      // La orden manda: reemplaza cualquier ruta activa de esa móvil en ese turno.
      await tx.patrolPlan.updateMany({
        where: { date: new Date(fecha), shift, unit_issi: movil.issi, status: 'ACTIVO' },
        data: { status: 'REEMPLAZADO' },
      });
      return tx.patrolPlan.create({
        data: {
          date: new Date(fecha),
          shift,
          source: 'MANUAL',
          unit_issi: movil.issi,
          unit_code: movil.codigo,
          unit_type: movil.subtipo,
          jurisdiction_id: movil.jurisdiccion?.id,
          jurisdiction: movil.jurisdiccion?.nombre,
          title: dto.titulo,
          ordered_by: dto.ordenado_por,
          order_ref: dto.documento,
          notes: dto.notas,
          route: ruta.geometry as Prisma.InputJsonValue,
          distance_m: ruta.distance_m,
          duration_s: ruta.duration_s,
          created_by: usuario,
          stops: {
            create: paradas.map((p, i) => ({
              order: i + 1,
              lat: p.lat,
              lng: p.lng,
              reason: p.motivo,
              dwell_min: p.permanencia_min ?? 10,
            })),
          },
        },
        include: incluirParadas,
      });
    });

    await this.audit.log({
      action: 'CREAR_RUTA_MANUAL',
      entity: 'PatrolPlan',
      entity_id: plan.id,
      changes: { movil: movil.codigo, ordenado_por: dto.ordenado_por, documento: dto.documento, paradas: paradas.length },
      performed_by: usuario,
    });
    return { ...plan, ruta_fuente: ruta.fuente, movil_en_linea: movil.en_linea };
  }

  async anular(id: string, usuario?: string) {
    const plan = await this.prisma.patrolPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Ruta no encontrada');
    const r = await this.prisma.patrolPlan.update({ where: { id }, data: { status: 'ANULADO' } });
    await this.audit.log({ action: 'ANULAR_RUTA', entity: 'PatrolPlan', entity_id: id, performed_by: usuario });
    return r;
  }

  // ─── Cumplimiento con el histórico GPS de la radio ─────────────────────────
  /** `desdeInicioTurno`: cuenta también lo recorrido antes de crear la ruta (¿ya pasaron hoy por esas zonas?). */
  async verificar(id: string, desdeInicioTurno = false) {
    const plan = await this.prisma.patrolPlan.findUnique({ where: { id }, include: incluirParadas });
    if (!plan) throw new NotFoundException('Ruta no encontrada');
    const fecha = plan.date.toISOString().slice(0, 10);
    const v = ventanaTurno(fecha, plan.shift);
    const desde = desdeInicioTurno ? v.inicio : new Date(Math.max(v.inicio.getTime(), plan.created_at.getTime()));
    const hasta = new Date(Math.min(v.fin.getTime(), Date.now()));
    if (hasta <= desde) return this.resumenCumplimiento(plan, 0, 'El turno aún no empieza');

    const [fd, hd] = formatoLima(desde).split(' ');
    const [fh, hh] = formatoLima(hasta).split(' ');
    const puntos = (await this.gps.findHistorico(plan.unit_issi, fd, hd, fh, hh))
      .map((p: any) => ({ lat: Number(p.latitud), lng: Number(p.longitud), t: parseDolphinDate(p.fechaHora) }))
      .filter((p) => p.t && p.t >= desde && p.t <= hasta) as { lat: number; lng: number; t: Date }[];

    const ahora = new Date();
    for (const s of plan.stops) {
      let minDist = Infinity;
      let visita: Date | null = null;
      let permanencia = 0;
      let previo: Date | null = null;
      for (const p of puntos) {
        const d = haversineM(s, p);
        if (d < minDist) minDist = d;
        if (d <= RADIO_VISITA_M) {
          visita ??= p.t;
          if (previo) {
            const gap = (p.t.getTime() - previo.getTime()) / 1000;
            if (gap > 0 && gap <= BRECHA_MAX_S) permanencia += gap;
          }
          previo = p.t;
        } else {
          previo = null;
        }
      }
      await this.prisma.patrolStop.update({
        where: { id: s.id },
        data: {
          visited_at: visita,
          dwell_s: Math.round(permanencia),
          min_dist_m: Number.isFinite(minDist) ? Math.round(minDist) : null,
          checked_at: ahora,
        },
      });
    }
    const actualizado = await this.prisma.patrolPlan.findUnique({ where: { id }, include: incluirParadas });
    return this.resumenCumplimiento(actualizado!, puntos.length, undefined, desde);
  }

  async verificarTurno(fecha?: string, turno?: Shift, desdeInicioTurno = false) {
    const planes = await this.listarPlanes(fecha, turno);
    const out: any[] = [];
    for (const p of planes) {
      try {
        out.push(await this.verificar(p.id, desdeInicioTurno));
      } catch (e: any) {
        this.logger.warn(`No se pudo verificar ${p.unit_code}: ${e?.message}`);
        out.push({ plan: p, error: 'No se pudo consultar el histórico GPS' });
      }
    }
    const total = out.reduce((s, r) => s + (r.paradas ?? 0), 0);
    const visitadas = out.reduce((s, r) => s + (r.visitadas ?? 0), 0);
    return { planes: out, paradas: total, visitadas, pct: total ? Math.round((100 * visitadas) / total) : null };
  }

  private resumenCumplimiento(plan: any, puntosGps: number, nota?: string, desde?: Date) {
    const visitadas = plan.stops.filter((s: any) => s.visited_at).length;
    return {
      plan,
      puntos_gps: puntosGps,
      paradas: plan.stops.length,
      visitadas,
      pct: plan.stops.length ? Math.round((100 * visitadas) / plan.stops.length) : null,
      nota,
      medido_desde: desde ?? null,
    };
  }
}
