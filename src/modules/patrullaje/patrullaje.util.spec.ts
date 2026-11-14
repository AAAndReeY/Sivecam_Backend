import { haversineM, ordenarParadas, parseDolphinDate } from './geo.util';
import { parseShift, turnoActual, ventanaTurno } from './turnos.util';

// Instante UTC a partir de una hora de Lima (UTC-5).
const lima = (s: string) => new Date(`${s}-05:00`);

describe('turnos', () => {
  it('asigna el turno según la hora de Lima', () => {
    expect(turnoActual(lima('2026-11-12T06:00:00'))).toEqual({ shift: 'MORNING', fecha: '2026-11-12' });
    expect(turnoActual(lima('2026-11-12T13:59:00'))).toEqual({ shift: 'MORNING', fecha: '2026-11-12' });
    expect(turnoActual(lima('2026-11-12T14:00:00'))).toEqual({ shift: 'AFTERNOON', fecha: '2026-11-12' });
    expect(turnoActual(lima('2026-11-12T22:30:00'))).toEqual({ shift: 'NIGHT', fecha: '2026-11-12' });
  });

  it('la madrugada pertenece al turno noche del día anterior', () => {
    expect(turnoActual(lima('2026-11-13T03:00:00'))).toEqual({ shift: 'NIGHT', fecha: '2026-11-12' });
    expect(turnoActual(lima('2026-11-01T05:59:00'))).toEqual({ shift: 'NIGHT', fecha: '2026-10-31' });
  });

  it('la ventana del turno noche cruza la medianoche', () => {
    const v = ventanaTurno('2026-11-12', 'NIGHT');
    expect(v.inicio.toISOString()).toBe('2026-11-13T03:00:00.000Z'); // 22:00 Lima
    expect(v.fin.toISOString()).toBe('2026-11-13T11:00:00.000Z'); // 06:00 Lima
  });

  it('acepta los nombres del motor predictivo', () => {
    expect(parseShift('manana')).toBe('MORNING');
    expect(parseShift('NOCHE')).toBe('NIGHT');
    expect(parseShift('AFTERNOON')).toBe('AFTERNOON');
    expect(parseShift('x')).toBeUndefined();
  });
});

describe('geo', () => {
  it('lee la fecha de Dolphin (hora de Lima, con o sin milisegundos)', () => {
    expect(parseDolphinDate('12/11/2026 10:30:31.184')?.toISOString()).toBe('2026-11-12T15:30:31.000Z');
    expect(parseDolphinDate('12/11/2026 10:30')?.toISOString()).toBe('2026-11-12T15:30:00.000Z');
    expect(parseDolphinDate('')).toBeNull();
  });

  it('haversine: 0.01° de latitud ≈ 1.1 km', () => {
    expect(Math.round(haversineM({ lat: -12, lng: -77 }, { lat: -12.01, lng: -77 }))).toBe(1112);
  });

  it('ordena las paradas sin cruzar la ruta', () => {
    const inicio = { lat: 0, lng: 0 };
    // Puntos en línea recta, desordenados: el orden óptimo es por distancia al inicio.
    const pts = [3, 1, 4, 2].map((k) => ({ lat: 0, lng: k * 0.01, k }));
    expect(ordenarParadas(inicio, pts).map((p) => p.k)).toEqual([1, 2, 3, 4]);
  });

  it('no pierde ni duplica paradas', () => {
    const pts = Array.from({ length: 9 }, (_, i) => ({ lat: Math.sin(i) * 0.02, lng: Math.cos(i * 1.7) * 0.02, i }));
    const r = ordenarParadas({ lat: 0, lng: 0 }, pts);
    expect(r.map((p) => p.i).sort()).toEqual(pts.map((p) => p.i).sort());
  });
});

describe('cámaras: ¿ve el punto?', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { veElPunto } = require('./camaras.service');
  const cam = (camera: string, angle: number | null) => ({ latitude: -12, longitude: -77, camera, angle, radius: 0.002 });
  const este = { lat: -12, lng: -76.999 }; // 0.001° al este (dentro del alcance)
  const oeste = { lat: -12, lng: -77.001 };
  it('C360 ve en todas direcciones', () => expect(veElPunto(cam('C360', null), oeste)).toBe(true));
  it('C180 mirando al este ve el este y no el oeste', () => {
    expect(veElPunto(cam('C180', 0), este)).toBe(true);
    expect(veElPunto(cam('C180', 0), oeste)).toBe(false);
  });
  it('fuera del alcance no ve', () => expect(veElPunto(cam('C360', null), { lat: -12, lng: -76.99 })).toBe(false));
  it('sin ángulo una C180 no se asume', () => expect(veElPunto(cam('C180', null), este)).toBe(false));
});
