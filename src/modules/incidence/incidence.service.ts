import { Injectable } from '@nestjs/common';
import { SqlService } from '../sql/sql.service';
import { FilterIncidenceDto } from './dto';

@Injectable()
export class IncidenceService {
  constructor(private readonly sql: SqlService) {}

  async findAll(dto: FilterIncidenceDto) {
    const { start, end, type, jurisdiction } = dto;
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
      whereExtra += ` AND "jurisdiccionId" = @jurisdiction`;
    }

    const query = `
      SELECT
        "codigoIncidencia",
        latitud,
        longitud,
        descripcion,
        "ocurridoEn",
        "jurisdiccionId"
      FROM incidencias
      WHERE "ocurridoEn" BETWEEN @start AND @end
        AND "subTipoCasoId" IN (${subtipoIds})
        ${whereExtra}
    `;

    const incidencias = await this.sql.query(query, params);

    const data = incidencias.map((r) => ({
      code: r.codigoIncidencia,
      latitude: r.latitud ? Number(r.latitud) : null,
      longitude: r.longitud ? Number(r.longitud) : null,
      description: r.descripcion,
      date: r.ocurridoEn?.toISOString().split('T')[0] ?? null,
      hour: r.ocurridoEn?.toISOString().split('T')[1].split('.')[0] ?? null,
      jurisdictionId: r.jurisdiccionId,
    }));

    return { count: data.length, data };
  }
}