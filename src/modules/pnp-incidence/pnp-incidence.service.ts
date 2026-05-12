import { BadRequestException, Injectable } from '@nestjs/common';
import { PnpIncidence } from '@prisma/client';
import { CreatePnpIncidenceDto, UpdatePnpIncidenceDto, FilterPnpIncidenceDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { AuditService } from '../audit/audit.service';

const MODALITY_INCLUDE = {
  modality: {
    include: {
      subtype: {
        include: {
          type: true,
        },
      },
    },
  },
};

@Injectable()
export class PnpIncidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePnpIncidenceDto, caller?: { username: string }): Promise<any> {
    const { occurred_at, ...rest } = dto;
    if (dto.modality_id) await this.validateModality(dto.modality_id);
    const incidence = await this.prisma.pnpIncidence.create({
      data: {
        ...rest,
        occurred_at: new Date(occurred_at),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'PnpIncidence',
      entity_id: incidence.id,
      changes: { jurisdiction: dto.jurisdiction, police_station: dto.police_station, modality_id: dto.modality_id },
      performed_by: caller?.username,
    });
    return this.getById(incidence.id);
  }

  async findAll(dto: FilterPnpIncidenceDto, caller?: { allowed_jurisdictions?: string[] }): Promise<any> {
    const {
      search, incidence_type, shift, police_station, case_status,
      jurisdiction, start, end, no_shift, type_id, subtype_id, modality_id,
      ...pagination
    } = dto;

    const where: any = { deleted_at: null };

    // Filtro de jurisdicciones del rol — forzado, no puede ser sobreescrito por query params
    if (caller?.allowed_jurisdictions?.length) {
      where.jurisdiction = { in: caller.allowed_jurisdictions };
    }

    if (search) {
      where.OR = [
        { description:      { contains: search, mode: 'insensitive' } },
        { complaint_number: { contains: search, mode: 'insensitive' } },
        { police_station:   { contains: search, mode: 'insensitive' } },
        { jurisdiction:     { contains: search, mode: 'insensitive' } },
        { modality: { name: { contains: search, mode: 'insensitive' } } },
        { modality: { subtype: { name: { contains: search, mode: 'insensitive' } } } },
        { modality: { subtype: { type: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    // Filtros por jerarquía
    if (modality_id) where.modality_id = modality_id;
    if (subtype_id)  where.modality = { subtype_id };
    if (type_id)     where.modality = { subtype: { type_id } };

    // Filtro legacy por texto (para compatibilidad)
    if (incidence_type) where.incidence_type = { contains: incidence_type, mode: 'insensitive' };

    if (no_shift === 'true') {
      where.shift = null;
    } else if (shift) {
      where.shift = shift;
    }
    if (police_station) where.police_station = { contains: police_station, mode: 'insensitive' };
    if (case_status)    where.case_status = case_status;
    // Solo aplicar filtro de jurisdiction por query param si el rol no restringe jurisdicciones
    if (jurisdiction && !caller?.allowed_jurisdictions?.length)
      where.jurisdiction = { contains: jurisdiction, mode: 'insensitive' };
    if (start && end) {
      where.occurred_at = {
        gte: new Date(start),
        lte: new Date(end + (end.includes('T') ? '' : 'T23:59:59')),
      };
    }

    return paginationHelper(
      this.prisma.pnpIncidence,
      {
        where,
        orderBy: { occurred_at: 'desc' },
        include: MODALITY_INCLUDE,
      },
      pagination,
    );
  }

  async getDistinctJurisdictions(): Promise<string[]> {
    const [incidenceRows, comisariaRows] = await Promise.all([
      this.prisma.pnpIncidence.findMany({
        select: { jurisdiction: true },
        distinct: ['jurisdiction'],
      }),
      this.prisma.comisaria.findMany({
        where: { deleted_at: null },
        select: { name: true },
      }),
    ]);

    // Quita el prefijo "Comisaria" o "Comisaría" del nombre
    const stripPrefix = (s: string) => s.replace(/^comisari[aá]\s+/i, '').trim();
    // Normaliza para comparar: minúsculas + sin acentos
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

    // Mapa normalizado -> nombre canónico
    // Primero las comisarías (base), luego las incidencias las sobreescriben (tienen acentos correctos)
    const map = new Map<string, string>();

    for (const row of comisariaRows) {
      const stripped = stripPrefix(row.name);
      if (stripped) map.set(norm(stripped), stripped);
    }
    for (const row of incidenceRows) {
      const j = row.jurisdiction?.trim();
      if (j) map.set(norm(j), j);
    }

    return [...map.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }

  async findOne(id: string): Promise<any> {
    return this.getById(id);
  }

  async update(id: string, dto: UpdatePnpIncidenceDto, caller?: { username: string }): Promise<any> {
    await this.getById(id);
    if (dto.modality_id) await this.validateModality(dto.modality_id);
    const { occurred_at, ...rest } = dto;
    await this.prisma.pnpIncidence.update({
      data: {
        ...rest,
        ...(occurred_at && { occurred_at: new Date(occurred_at) }),
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'PnpIncidence',
      entity_id: id,
      changes: { ...rest, ...(occurred_at && { occurred_at }) },
      performed_by: caller?.username,
    });
    return this.getById(id);
  }

  async toggleDelete(id: string, caller?: { username: string }): Promise<any> {
    const incidence = await this.getById(id, true);
    const deleted_at = incidence.deleted_at ? null : timezoneHelper();
    await this.prisma.pnpIncidence.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });
    const action = incidence.deleted_at ? 'RESTORE' : 'DELETE';
    await this.audit.log({
      action,
      entity: 'PnpIncidence',
      entity_id: id,
      changes: { jurisdiction: incidence.jurisdiction, police_station: incidence.police_station },
      performed_by: caller?.username,
    });
    return { action, id };
  }

  private async validateModality(modality_id: string) {
    const modality = await this.prisma.incidenceModality.findUnique({ where: { id: modality_id } });
    if (!modality || modality.deleted_at) throw new BadRequestException('Modalidad de incidencia no encontrada');
  }

  private async getById(id: string, toggle = false): Promise<any> {
    const incidence = await this.prisma.pnpIncidence.findUnique({
      where: { id },
      include: MODALITY_INCLUDE,
    });
    if (!incidence) throw new BadRequestException('Incidencia PNP no encontrada');
    if (incidence.deleted_at && !toggle) throw new BadRequestException('Incidencia PNP eliminada');
    return incidence;
  }
}
