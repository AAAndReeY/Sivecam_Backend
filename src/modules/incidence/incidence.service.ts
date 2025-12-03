import { Injectable } from '@nestjs/common';
import { FilterIncidenceDto } from './dto';
import { SqlService } from '../sql/sql.service';
import { TypologyService } from '../typology/typology.service';
import {
  jurisdictions,
  scheduleRanges,
  SQL_SCHEDULE_CASE,
  SQL_SHIFT_CASE,
} from './constants';
import { getScheduleFromTime, getShiftFromTime } from './helpers';

@Injectable()
export class IncidenceService {
  constructor(
    private readonly sql: SqlService,
    private readonly typologyService: TypologyService,
  ) {}

  async findAll(dto: FilterIncidenceDto) {
    const { start, end, type, jurisdiction, schedule, shift } = dto;
    const params: Record<string, any> = { start, end };
    const where: string[] = [
      `CAST(fecha_ocurrencia AS DATE) BETWEEN @start AND @end`,
    ];
    const types = await this.typologyService.getIdsByMapId(type);
    const typesList = types.join(',');
    where.push(`sub_tipo_caso_id IN (${typesList})`);
    if (jurisdiction) {
      params.jurisdiction = jurisdiction;
      where.push(`jurisdiccion_id = @jurisdiction`);
    }
    if (shift) {
      params.shift = shift;
      where.push(`(${SQL_SHIFT_CASE}) = @shift`);
    }
    if (schedule) {
      params.schedule = schedule;
      where.push(`(${SQL_SCHEDULE_CASE}) = @schedule`);
    }
    const query = `
      SELECT codigo_incidencia, latitud, longitud, descripcion, fecha_ocurrencia, hora_ocurrencia, jurisdiccion_id
      FROM incidencias
      WHERE ${where.join(' AND ')}
    `;
    const incidences = await this.sql.query(query, params);
    const data = incidences.map((r) => {
      const turno = getShiftFromTime(r.hora_ocurrencia);
      const scheduleId = getScheduleFromTime(r.hora_ocurrencia);

      return {
        code: r.codigo_incidencia,
        latitude: Number(r.latitud),
        longitude: Number(r.longitud),
        description: r.descripcion,
        date: r.fecha_ocurrencia.toISOString().split('T')[0],
        hour: r.hora_ocurrencia.toISOString().split('T')[1].split('.')[0],
        shift:
          turno === 1
            ? 'Turno mañana'
            : turno === 2
              ? 'Turno tarde'
              : 'Turno noche',
        schedule: scheduleRanges[scheduleId],
        jurisdiction: jurisdictions[r.jurisdiccion_id],
      };
    });
    return {
      count: incidences.length,
      data,
    };
  }
}
