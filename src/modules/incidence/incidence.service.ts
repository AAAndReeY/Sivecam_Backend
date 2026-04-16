import { Injectable } from '@nestjs/common';
import { SqlService } from '../sql/sql.service';
import { FilterIncidenceDto } from './dto';
import { getShiftFromTime, getScheduleFromTime } from './helpers';
import { scheduleRanges } from './constants/schedule.contant';

const shiftNames: Record<number, string> = {
  1: 'Turno Mañana',
  2: 'Turno Tarde',
  3: 'Turno Noche',
};

@Injectable()
export class IncidenceService {
  constructor(private readonly sql: SqlService) {}

  async findAll(dto: FilterIncidenceDto) {
    const { start, end, type, jurisdiction, shift: shiftFilter, schedule: scheduleFilter } = dto;
    const params: Record<string, any> = { start, end };

    // Obtener subtipos del tipo solicitado
    const subtipos = await this.sql.query<{ id: number }>(
      `SELECT id FROM sub_tipo_casos WHERE "tipoCasoId" = @type AND habilitado = true`,
      { type },
    );

    if (!subtipos.length) return { count: 0, data: [] };

    const subtipoIds = subtipos.map((s) => s.id).join(',');

    let whereExtra = '';
    if (jurisdiction) {
      params.jurisdiction = jurisdiction;
      whereExtra += ` AND i."jurisdiccionId" = @jurisdiction`;
    }

    if (shiftFilter) {
      params.shift = shiftFilter;
      whereExtra += `
        AND (
          CASE
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') >= 6 AND EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 14 THEN 1
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') >= 14 AND EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 22 THEN 2
            ELSE 3
          END = @shift
        )`;
    }

    if (scheduleFilter) {
      params.schedule = scheduleFilter;
      whereExtra += `
        AND (
          CASE
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 2  THEN 1
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 4  THEN 2
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 6  THEN 3
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 8  THEN 4
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 10 THEN 5
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 12 THEN 6
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 14 THEN 7
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 16 THEN 8
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 18 THEN 9
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 20 THEN 10
            WHEN EXTRACT(HOUR FROM i."ocurridoEn" AT TIME ZONE 'America/Lima') < 22 THEN 11
            ELSE 12
          END = @schedule
        )`;
    }

    const query = `
      SELECT
        i."codigoIncidencia",
        i.latitud,
        i.longitud,
        i.descripcion,
        i."ocurridoEn",
        i."jurisdiccionId",
        j.nombre AS "jurisdiccionNombre"
      FROM incidencias i
      LEFT JOIN jurisdicciones j ON i."jurisdiccionId" = j.id
      WHERE (i."ocurridoEn" AT TIME ZONE 'America/Lima')::date BETWEEN @start::date AND @end::date
        AND i."subTipoCasoId" IN (${subtipoIds})
        ${whereExtra}
    `;

    const incidencias = await this.sql.query(query, params);

    const data = incidencias.map((r) => {
      const shift = r.ocurridoEn ? getShiftFromTime(new Date(r.ocurridoEn)) : null;
      const scheduleIdx = r.ocurridoEn ? getScheduleFromTime(new Date(r.ocurridoEn)) : null;

      return {
        code: r.codigoIncidencia,
        latitude: r.latitud ? Number(r.latitud) : null,
        longitude: r.longitud ? Number(r.longitud) : null,
        description: r.descripcion,
        date: r.ocurridoEn ? new Date(r.ocurridoEn).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) : null,
        hour: r.ocurridoEn ? new Date(r.ocurridoEn).toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour12: false }) : null,
        shift: shift ? shiftNames[shift] : null,
        schedule: scheduleIdx ? scheduleRanges[scheduleIdx] : null,
        jurisdiction: r.jurisdiccionNombre ?? null,
        jurisdictionId: r.jurisdiccionId,
      };
    });

    return { count: data.length, data };
  }
}