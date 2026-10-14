import { checkSchedule, describeSchedule, limaClock, outOfScheduleMessage } from './access-schedule';

// Lima = UTC-5 todo el año. 2026-10-12 es lunes.
const lima = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`);
const MON = '2026-10-12';
const SAT = '2026-10-17';
const SUN = '2026-10-18';

const dayShift = { access_start: '07:00', access_end: '14:00', access_days: [1, 2, 3, 4, 5, 6] };
const nightShift = { access_start: '22:00', access_end: '06:00', access_days: [1, 2, 3, 4, 5] };

describe('access-schedule', () => {
  it('limaClock usa la hora de Lima', () => {
    expect(limaClock(new Date('2026-10-12T12:30:15Z'))).toEqual({ day: 1, seconds: 7 * 3600 + 30 * 60 + 15 });
    // 02:00 UTC del martes = 21:00 del lunes en Lima
    expect(limaClock(new Date('2026-10-13T02:00:00Z')).day).toBe(1);
  });

  it('sin horario: siempre permitido', () => {
    expect(checkSchedule({ access_start: null, access_end: null, access_days: [] }).allowed).toBe(true);
  });

  describe('turno de día 07:00-14:00, lun a sáb', () => {
    it.each([
      [MON, '06:59', false],
      [MON, '07:00', true],
      [MON, '13:59', true],
      [MON, '14:00', false],
      [MON, '20:00', false],
      [SAT, '10:00', true],
      [SUN, '10:00', false],
    ])('%s %s → %s', (d, t, allowed) => {
      expect(checkSchedule(dayShift, lima(d, t)).allowed).toBe(allowed);
    });

    it('calcula cuánto falta para el fin del turno', () => {
      expect(checkSchedule(dayShift, lima(MON, '13:30')).msUntilEnd).toBe(30 * 60 * 1000);
    });
  });

  describe('turno de noche 22:00-06:00, empieza lun a vie', () => {
    it.each([
      [MON, '21:59', false],
      [MON, '22:00', true],
      [MON, '23:59', true],
      ['2026-10-13', '03:00', true], // madrugada del martes: turno del lunes
      ['2026-10-13', '06:00', false],
      [MON, '03:00', false], // madrugada del lunes: el domingo no tiene turno
      [SAT, '03:00', true], // madrugada del sábado: turno del viernes
      [SAT, '22:30', false], // el sábado no empieza turno
    ])('%s %s → %s', (d, t, allowed) => {
      expect(checkSchedule(nightShift, lima(d, t)).allowed).toBe(allowed);
    });

    it('calcula el fin del turno al día siguiente', () => {
      expect(checkSchedule(nightShift, lima(MON, '23:00')).msUntilEnd).toBe(7 * 3600 * 1000);
      expect(checkSchedule(nightShift, lima('2026-10-13', '05:00')).msUntilEnd).toBe(3600 * 1000);
    });
  });

  it('días vacíos se tratan como todos los días', () => {
    const s = { access_start: '07:00', access_end: '14:00', access_days: [] };
    expect(checkSchedule(s, lima(SUN, '08:00')).allowed).toBe(true);
  });

  it('describe el horario en texto', () => {
    expect(describeSchedule(dayShift)).toBe('de 07:00 a 14:00, lun a sáb');
    expect(describeSchedule({ ...dayShift, access_days: [1, 3, 5] })).toBe('de 07:00 a 14:00, lun, mié, vie');
    expect(describeSchedule({ ...dayShift, access_days: [1, 2, 3, 4, 5, 6, 7] })).toBe('de 07:00 a 14:00, todos los días');
    expect(outOfScheduleMessage(nightShift)).toContain('de 22:00 a 06:00, lun a vie');
  });
});
