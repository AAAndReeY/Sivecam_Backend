import { BadRequestException, Injectable } from '@nestjs/common';
import { PnpIncidence } from '@prisma/client';
import { CreatePnpIncidenceDto, UpdatePnpIncidenceDto, FilterPnpIncidenceDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';

@Injectable()
export class PnpIncidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePnpIncidenceDto): Promise<PnpIncidence> {
    const { occurred_at, ...rest } = dto;
    const incidence = await this.prisma.pnpIncidence.create({
      data: {
        ...rest,
        occurred_at: new Date(occurred_at),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return this.getById(incidence.id);
  }

  async findAll(dto: FilterPnpIncidenceDto): Promise<any> {
    const { search, incidence_type, shift, police_station, case_status, jurisdiction, start, end, no_shift, ...pagination } = dto;

    const where: any = { deleted_at: null };

    if (search) {
      where.OR = [
        { description:    { contains: search, mode: 'insensitive' } },
        { complaint_number: { contains: search, mode: 'insensitive' } },
        { police_station: { contains: search, mode: 'insensitive' } },
        { incidence_type: { contains: search, mode: 'insensitive' } },
        { jurisdiction:   { contains: search, mode: 'insensitive' } },
      ];
    }
    if (incidence_type) where.incidence_type = { contains: incidence_type, mode: 'insensitive' };
    if (no_shift === 'true') {
      where.shift = null;
    } else if (shift) {
      where.shift = shift;
    }
    if (police_station) where.police_station = { contains: police_station, mode: 'insensitive' };
    if (case_status) where.case_status = case_status;
    if (jurisdiction) where.jurisdiction = { contains: jurisdiction, mode: 'insensitive' };
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
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<PnpIncidence> {
    return this.getById(id);
  }

  async update(id: string, dto: UpdatePnpIncidenceDto): Promise<PnpIncidence> {
    await this.getById(id);
    const { occurred_at, ...rest } = dto;
    await this.prisma.pnpIncidence.update({
      data: {
        ...rest,
        ...(occurred_at && { occurred_at: new Date(occurred_at) }),
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return this.getById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const incidence = await this.getById(id, true);
    const deleted_at = incidence.deleted_at ? null : timezoneHelper();
    await this.prisma.pnpIncidence.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });
    return {
      action: incidence.deleted_at ? 'Restore' : 'Delete',
      id,
    };
  }

  private async getById(id: string, toggle = false): Promise<any> {
    const incidence = await this.prisma.pnpIncidence.findUnique({ where: { id } });
    if (!incidence) throw new BadRequestException('Incidencia PNP no encontrada');
    if (incidence.deleted_at && !toggle) throw new BadRequestException('Incidencia PNP eliminada');
    return incidence;
  }
}
