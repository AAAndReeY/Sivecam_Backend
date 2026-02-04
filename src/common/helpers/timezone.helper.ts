export function timezoneHelper(): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const [datePart, timePart] = fmt.format(now).split(', ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
}

export function parseStringDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Formato de fecha inválido: ${date}`);
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0));
}

export function parseNumberDate(serial: number): Date {
  const epoch = 25569;
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcMs = (serial - epoch) * msPerDay;
  const date = new Date(utcMs);
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}
