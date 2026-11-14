// Utilidades geográficas del módulo de patrullaje y despacho (sin dependencias externas).

export type LatLng = { lat: number; lng: number };

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Respaldo cuando no hay ruteo por calles: en SJL la distancia por calle ≈ 1.35 × la recta, a ~25 km/h.
export const FACTOR_VIAL = 1.35;
export const VELOCIDAD_URBANA_MS = 25 / 3.6;

export function estimarRuta(a: LatLng, b: LatLng) {
  const distance_m = Math.round(haversineM(a, b) * FACTOR_VIAL);
  return { distance_m, duration_s: Math.round(distance_m / VELOCIDAD_URBANA_MS) };
}

/** Dolphin entrega "dd/mm/yyyy hh:mm:ss" en hora de Lima. */
export function parseDolphinDate(s: string | null | undefined): Date | null {
  const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}-05:00`);
}

/**
 * Orden de visita de las paradas partiendo de `inicio` (ruta abierta):
 * vecino más cercano y luego mejora 2-opt. Suficiente para 5-12 paradas.
 */
export function ordenarParadas<T extends LatLng>(inicio: LatLng, paradas: T[]): T[] {
  if (paradas.length <= 2) {
    return [...paradas].sort((a, b) => haversineM(inicio, a) - haversineM(inicio, b));
  }
  const pendientes = [...paradas];
  const ruta: T[] = [];
  let actual: LatLng = inicio;
  while (pendientes.length) {
    let mejor = 0;
    for (let i = 1; i < pendientes.length; i++) {
      if (haversineM(actual, pendientes[i]) < haversineM(actual, pendientes[mejor])) mejor = i;
    }
    actual = pendientes.splice(mejor, 1)[0];
    ruta.push(actual as T);
  }
  const pts: LatLng[] = [inicio, ...ruta];
  const largo = (p: LatLng[]) => p.slice(1).reduce((s, x, i) => s + haversineM(p[i], x), 0);
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 1; i < pts.length - 1; i++) {
      for (let k = i + 1; k < pts.length; k++) {
        const cand = [...pts.slice(0, i), ...pts.slice(i, k + 1).reverse(), ...pts.slice(k + 1)];
        if (largo(cand) + 1 < largo(pts)) {
          pts.splice(0, pts.length, ...cand);
          mejoro = true;
        }
      }
    }
  }
  return pts.slice(1) as T[];
}

export function enlacesNavegacion(p: LatLng) {
  const ll = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  return {
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
  };
}

// ─── OSRM ────────────────────────────────────────────────────────────────────
// Por defecto el servidor público (solo para la prueba: tiene límite de uso).
// En producción: OSRM propio con el extracto de Perú (variable OSRM_URL).
const OSRM_URL = () => (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');

async function osrmGet(path: string, timeoutMs: number): Promise<any | null> {
  try {
    const res = await fetch(`${OSRM_URL()}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const js = await res.json();
    return js?.code === 'Ok' ? js : null;
  } catch {
    return null;
  }
}

const coords = (pts: LatLng[]) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');

/** Ruta por calles que pasa por todos los puntos. Si OSRM no responde, une los puntos en línea recta. */
export async function rutaPorCalles(pts: LatLng[]) {
  const js = pts.length >= 2 ? await osrmGet(`/route/v1/driving/${coords(pts)}?overview=full&geometries=geojson`, 6000) : null;
  if (js?.routes?.[0]) {
    const r = js.routes[0];
    return {
      fuente: 'osrm' as const,
      geometry: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
      distance_m: Math.round(r.distance),
      duration_s: Math.round(r.duration),
    };
  }
  let distance_m = 0;
  for (let i = 1; i < pts.length; i++) distance_m += estimarRuta(pts[i - 1], pts[i]).distance_m;
  return {
    fuente: 'estimado' as const,
    geometry: pts.map((p) => [p.lat, p.lng]),
    distance_m,
    duration_s: Math.round(distance_m / VELOCIDAD_URBANA_MS),
  };
}

/** Tiempo y distancia por calles de varios orígenes a un destino, en UNA sola consulta (OSRM table). */
export async function matrizHaciaDestino(origenes: LatLng[], destino: LatLng) {
  if (!origenes.length) return [];
  const idx = origenes.map((_, i) => i).join(';');
  const js = await osrmGet(
    `/table/v1/driving/${coords([...origenes, destino])}?sources=${idx}&destinations=${origenes.length}&annotations=duration,distance`,
    4000,
  );
  return origenes.map((o, i) => {
    const d = js?.durations?.[i]?.[0];
    const m = js?.distances?.[i]?.[0];
    if (d != null && m != null) return { fuente: 'osrm' as const, duration_s: Math.round(d), distance_m: Math.round(m) };
    return { fuente: 'estimado' as const, ...estimarRuta(o, destino) };
  });
}
