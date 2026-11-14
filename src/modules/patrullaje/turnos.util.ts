import { Shift } from '@prisma/client';

// SUPUESTO de la prueba: 3 turnos de 8 h (hora de Lima). Debe coincidir con
// TURNOS_SERENAZGO del motor predictivo. Ajustar cuando se confirmen los horarios reales.
export const TURNOS: Record<Shift, { clave: 'MANANA' | 'TARDE' | 'NOCHE'; nombre: string; inicio: number; horas: number }> = {
  MORNING: { clave: 'MANANA', nombre: 'Mañana (06:00-14:00)', inicio: 6, horas: 8 },
  AFTERNOON: { clave: 'TARDE', nombre: 'Tarde (14:00-22:00)', inicio: 14, horas: 8 },
  NIGHT: { clave: 'NOCHE', nombre: 'Noche (22:00-06:00)', inicio: 22, horas: 8 },
};

const LIMA_OFFSET_MS = -5 * 3600 * 1000; // Perú no usa horario de verano

/** Fecha (YYYY-MM-DD) y hora actuales en Lima. */
export function ahoraLima(d = new Date()) {
  const l = new Date(d.getTime() + LIMA_OFFSET_MS);
  return { fecha: l.toISOString().slice(0, 10), hora: l.getUTCHours() };
}

/** Turno en curso y la fecha en que empezó (la noche de 00-06 pertenece al día anterior). */
export function turnoActual(d = new Date()): { shift: Shift; fecha: string } {
  const { fecha, hora } = ahoraLima(d);
  if (hora >= 6 && hora < 14) return { shift: 'MORNING', fecha };
  if (hora >= 14 && hora < 22) return { shift: 'AFTERNOON', fecha };
  if (hora >= 22) return { shift: 'NIGHT', fecha };
  return { shift: 'NIGHT', fecha: ahoraLima(new Date(d.getTime() - 24 * 3600 * 1000)).fecha };
}

/** Inicio y fin del turno (instantes UTC). */
export function ventanaTurno(fecha: string, shift: Shift) {
  const t = TURNOS[shift];
  const inicio = new Date(`${fecha}T${String(t.inicio).padStart(2, '0')}:00:00-05:00`);
  return { inicio, fin: new Date(inicio.getTime() + t.horas * 3600 * 1000) };
}

/** "YYYY-MM-DD HH:MM:SS" en hora de Lima (formato que acepta el histórico de Dolphin). */
export function formatoLima(d: Date) {
  return new Date(d.getTime() + LIMA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

export function parseShift(v: string | undefined): Shift | undefined {
  if (!v) return undefined;
  const u = v.toUpperCase();
  if (u in TURNOS) return u as Shift;
  const porClave = (Object.keys(TURNOS) as Shift[]).find((s) => TURNOS[s].clave === u);
  return porClave;
}
