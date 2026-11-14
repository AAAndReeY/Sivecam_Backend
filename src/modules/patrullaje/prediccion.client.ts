import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LatLng, haversineM } from './geo.util';

export interface Jurisdiccion {
  id: number;
  nombre: string;
}

type Anillo = [number, number][]; // [lng, lat]
interface PoligonoJur extends Jurisdiccion {
  poligonos: Anillo[][]; // lista de polígonos; cada uno: [exterior, ...huecos]
  centro: LatLng;
}

/** Punto dentro de un anillo (ray casting). */
function dentroAnillo(p: LatLng, anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * Cliente del motor predictivo (proyecto PredivctiveIncidence, FastAPI, solo red interna).
 * SIVECAM lo consulta servidor a servidor con x-api-key; el navegador nunca lo llama directo.
 * También entrega los polígonos (GeoJSON) de las jurisdicciones, con el mismo id que usan las zonas de riesgo.
 */
@Injectable()
export class PrediccionClient {
  private readonly logger = new Logger(PrediccionClient.name);
  private jurCache: { at: number; lista: PoligonoJur[]; geojson: any } | null = null;
  private readonly JUR_TTL_MS = 60 * 60 * 1000;
  // Si el motor está caído no se reintenta en cada consulta: se espera COOLDOWN_MS y se avisa una sola vez.
  private readonly COOLDOWN_MS = 60 * 1000;
  private caidoHasta = 0;
  private avisado = false;
  private jurEnCurso: Promise<NonNullable<PrediccionClient['jurCache']>> | null = null;

  private get base() {
    return (process.env.PREDICCION_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  }

  private async get<T = any>(path: string, timeoutMs = 15000): Promise<T> {
    if (Date.now() < this.caidoHasta) throw new ServiceUnavailableException('El motor predictivo no está disponible');
    try {
      const res = await fetch(`${this.base}${path}`, {
        headers: { 'x-api-key': process.env.PREDICCION_API_KEY ?? '' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as T;
      if (this.avisado) this.logger.log('Motor predictivo disponible de nuevo');
      this.avisado = false;
      return json;
    } catch (e: any) {
      this.caidoHasta = Date.now() + this.COOLDOWN_MS;
      if (!this.avisado) {
        this.logger.warn(
          `Motor predictivo no disponible (${path}): ${e?.message}. Se reintenta cada ${this.COOLDOWN_MS / 1000} s sin repetir este aviso.`,
        );
        this.avisado = true;
      }
      throw new ServiceUnavailableException('El motor predictivo no está disponible');
    }
  }

  estado() {
    return this.get('/api/health', 5000);
  }

  hotspots(p: { turno?: string; top?: number; dias?: number; grupo?: string; minDistM?: number; jurisdiccionId?: number }) {
    const q = new URLSearchParams({
      dias: String(p.dias ?? 1),
      top: String(p.top ?? 20),
      grupo: p.grupo ?? 'TODOS',
      min_dist_m: String(p.minDistM ?? 350),
    });
    if (p.turno) q.set('turno', p.turno);
    if (p.jurisdiccionId) q.set('jurisdiccion_id', String(p.jurisdiccionId));
    return this.get<{ rows: any[]; origen: string; version: number; turno: string | null; calidad: any }>(
      `/api/hotspots?${q}`,
    );
  }

  incidenciasRecientes(horas = 12, limit = 300) {
    return this.get<{ rows: any[] }>(`/api/incidencias/recientes?horas=${horas}&limit=${limit}`);
  }

  // ─── Jurisdicciones (GeoJSON del motor) ─────────────────────────────────────
  private async cargarJurisdicciones() {
    if (this.jurCache && Date.now() - this.jurCache.at < this.JUR_TTL_MS) return this.jurCache;
    // Una sola descarga aunque lleguen muchas consultas a la vez (una por radio)
    if (!this.jurEnCurso) this.jurEnCurso = this.descargarJurisdicciones().finally(() => (this.jurEnCurso = null));
    try {
      return await this.jurEnCurso;
    } catch (e) {
      if (this.jurCache) return this.jurCache; // motor caído: se siguen usando los polígonos ya descargados
      throw e;
    }
  }

  private async descargarJurisdicciones() {
    const capas = await this.get<{ jurisdicciones: any }>('/api/capas', 20000);
    const lista: PoligonoJur[] = [];
    for (const f of capas.jurisdicciones?.features ?? []) {
      const id = f.properties?.jurisdiccion_id;
      if (id == null || !f.geometry) continue;
      const poligonos: Anillo[][] =
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      const ext = poligonos.flatMap((p) => p[0] ?? []);
      if (!ext.length) continue;
      const centro = {
        lat: ext.reduce((s, c) => s + c[1], 0) / ext.length,
        lng: ext.reduce((s, c) => s + c[0], 0) / ext.length,
      };
      lista.push({ id: Number(id), nombre: f.properties.nombre, poligonos, centro });
    }
    this.jurCache = { at: Date.now(), lista, geojson: capas.jurisdicciones };
    return this.jurCache;
  }

  async jurisdiccionesGeojson() {
    return (await this.cargarJurisdicciones()).geojson;
  }

  async listaJurisdicciones(): Promise<Jurisdiccion[]> {
    return (await this.cargarJurisdicciones()).lista.map(({ id, nombre }) => ({ id, nombre }));
  }

  /**
   * Jurisdicción donde está el punto (polígono). Si cae fuera de todas (borde del distrito, GPS impreciso),
   * se devuelve la de centro más cercano y `aproximada: true`.
   */
  async jurisdiccionDe(p: LatLng): Promise<(Jurisdiccion & { aproximada: boolean }) | null> {
    let cache: Awaited<ReturnType<PrediccionClient['cargarJurisdicciones']>>;
    try {
      cache = await this.cargarJurisdicciones();
    } catch {
      return null;
    }
    for (const j of cache.lista) {
      if (j.poligonos.some(([ext, ...huecos]) => ext && dentroAnillo(p, ext) && !huecos.some((h) => dentroAnillo(p, h)))) {
        return { id: j.id, nombre: j.nombre, aproximada: false };
      }
    }
    let mejor: PoligonoJur | null = null;
    for (const j of cache.lista) if (!mejor || haversineM(p, j.centro) < haversineM(p, mejor.centro)) mejor = j;
    return mejor ? { id: mejor.id, nombre: mejor.nombre, aproximada: true } : null;
  }
}
