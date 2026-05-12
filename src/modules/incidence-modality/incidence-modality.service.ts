import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { CreateIncidenceModalityDto, UpdateIncidenceModalityDto, FilterIncidenceModalityDto } from './dto';

@Injectable()
export class IncidenceModalityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIncidenceModalityDto) {
    await this.validateSubtype(dto.subtype_id);
    const exists = await this.prisma.incidenceModality.findUnique({
      where: { name_subtype_id: { name: dto.name, subtype_id: dto.subtype_id } },
    });
    if (exists) throw new BadRequestException('Ya existe una modalidad con ese nombre para este subtipo');
    const record = await this.prisma.incidenceModality.create({
      data: { ...dto, created_at: timezoneHelper(), updated_at: timezoneHelper() },
    });
    return this.getById(record.id);
  }

  async findAll(dto: FilterIncidenceModalityDto) {
    const { search, subtype_id, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (subtype_id) where.subtype_id = subtype_id;
    return paginationHelper(
      this.prisma.incidenceModality,
      {
        where,
        orderBy: { name: 'asc' },
        include: {
          subtype: {
            select: {
              id: true,
              name: true,
              type: { select: { id: true, name: true } },
            },
          },
        },
      },
      pagination,
    );
  }

  async findOne(id: string) {
    return this.getById(id);
  }

  async update(id: string, dto: UpdateIncidenceModalityDto) {
    await this.getById(id);
    if (dto.subtype_id) await this.validateSubtype(dto.subtype_id);
    await this.prisma.incidenceModality.update({
      data: { ...dto, updated_at: timezoneHelper() },
      where: { id },
    });
    return this.getById(id);
  }

  async toggleDelete(id: string) {
    const record = await this.getById(id, true);
    const deleted_at = record.deleted_at ? null : timezoneHelper();
    await this.prisma.incidenceModality.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });
    return { action: record.deleted_at ? 'Restore' : 'Delete', id };
  }

  private async validateSubtype(subtype_id: string) {
    const subtype = await this.prisma.incidenceSubtype.findUnique({ where: { id: subtype_id } });
    if (!subtype || subtype.deleted_at) throw new BadRequestException('Subtipo de incidencia no encontrado');
  }

  private async getById(id: string, toggle = false) {
    const record = await this.prisma.incidenceModality.findUnique({
      where: { id },
      include: {
        subtype: {
          select: {
            id: true,
            name: true,
            type: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!record) throw new BadRequestException('Modalidad de incidencia no encontrada');
    if (record.deleted_at && !toggle) throw new BadRequestException('Modalidad de incidencia eliminada');
    return record;
  }
}
