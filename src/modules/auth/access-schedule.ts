// Horario de acceso por usuario: solo puede usar el sistema entre access_start y
// access_end (hora de Lima), los días de access_days (1 = lunes … 7 = domingo).
// Si access_end <= access_start el turno cruza la medianoche (ej. 22:00 a 06:00) y
// el día marcado es el día en que EMPIEZA el turno.

export type AccessSchedule = {
  access_start: string | null;
  access_end: string | null;
  access_days: number[];
};

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAY_NAMES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const DAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const limaFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Lima',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const toSeconds = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
};

// Día de la semana (1-7) y segundo del día en hora de Lima
export function limaClock(now: Date = new Date()) {
  const parts = Object.fromEntries(limaFormat.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    day: DAY_INDEX[parts.weekday],
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

export const hasSchedule = (s: Partial<AccessSchedule>) => !!(s.access_start && s.access_end);

// allowed: si puede usar el sistema ahora. msUntilEnd: cuánto le queda del turno actual.
export function checkSchedule(s: AccessSchedule, now: Date = new Date()): { allowed: boolean; msUntilEnd?: number } {
  if (!hasSchedule(s)) return { allowed: true };
  const start = toSeconds(s.access_start!);
  const end = toSeconds(s.access_end!);
  const days = s.access_days?.length ? s.access_days : [1, 2, 3, 4, 5, 6, 7];
  const { day, seconds } = limaClock(now);
  const prevDay = day === 1 ? 7 : day - 1;
  const ms = (sec: number) => sec * 1000;

  if (end > start) {
    if (days.includes(day) && seconds >= start && seconds < end) return { allowed: true, msUntilEnd: ms(end - seconds) };
    return { allowed: false };
  }
  // Turno que cruza la medianoche
  if (days.includes(day) && seconds >= start) return { allowed: true, msUntilEnd: ms(86400 - seconds + end) };
  if (days.includes(prevDay) && seconds < end) return { allowed: true, msUntilEnd: ms(end - seconds) };
  return { allowed: false };
}

// "de 07:00 a 14:00, lun a sáb"
export function describeSchedule(s: AccessSchedule): string {
  const days = [...new Set(s.access_days?.length ? s.access_days : [1, 2, 3, 4, 5, 6, 7])].sort((a, b) => a - b);
  let dayText: string;
  if (days.length === 7) dayText = 'todos los días';
  else {
    const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    dayText =
      contiguous && days.length > 2
        ? `${DAY_NAMES[days[0] - 1]} a ${DAY_NAMES[days[days.length - 1] - 1]}`
        : days.map((d) => DAY_NAMES[d - 1]).join(', ');
  }
  return `de ${s.access_start} a ${s.access_end}, ${dayText}`;
}

export const outOfScheduleMessage = (s: AccessSchedule) =>
  `Tu horario de acceso es ${describeSchedule(s)}. Fuera de ese horario no puedes ingresar.`;
