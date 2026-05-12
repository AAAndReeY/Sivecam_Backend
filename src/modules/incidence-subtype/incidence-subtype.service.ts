import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { CreateIncidenceSubtypeDto, UpdateIncidenceSubtypeDto, FilterIncidenceSubtypeDto } from './dto';

@Injectable()
export class IncidenceSubtypeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIncidenceSubtypeDto) {
    await this.validateType(dto.type_id);
    const exists = await this.prisma.incidenceSubtype.findUnique({
      where: { name_type_id: { name: dto.name, type_id: dto.type_id } },
    });
    if (exists) throw new BadRequestException('Ya existe un subtipo con ese nombre para este tipo');
    const record = await this.prisma.incidenceSubtype.create({
      data: { ...dto, created_at: timezoneHelper(), updated_at: timezoneHelper() },
    });
    return this.getById(record.id);
  }

  async findAll(dto: FilterIncidenceSubtypeDto) {
    const { search, type_id, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (type_id) where.type_id = type_id;
    return paginationHelper(
      this.prisma.incidenceSubtype,
      {
        where,
        orderBy: { name: 'asc' },
        include: { type: { select: { id: true, name: true } } },
      },
      pagination,
    );
  }

  async findOne(id: string) {
    return this.getById(id);
  }

  async update(id: string, dto: UpdateIncidenceSubtypeDto) {
    await this.getById(id);
    if (dto.type_id) await this.validateType(dto.type_id);
    await this.prisma.incidenceSubtype.update({
      data: { ...dto, updated_at: timezoneHelper() },
      where: { id },
    });
    return this.getById(id);
  }

  async toggleDelete(id: string) {
    const record = await this.getById(id, true);
    const deleted_at = record.deleted_at ? null : timezoneHelper();
    await this.prisma.incidenceSubtype.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });
    return { action: record.deleted_at ? 'Restore' : 'Delete', id };
  }

  private async validateType(type_id: string) {
    const type = await this.prisma.incidenceType.findUnique({ where: { id: type_id } });
    if (!type || type.deleted_at) throw new BadRequestException('Tipo de incidencia no encontrado');
  }

  private async getById(id: string, toggle = false) {
    const record = await this.prisma.incidenceSubtype.findUnique({
      where: { id },
      include: { type: { select: { id: true, name: true } } },
    });
    if (!record) throw new BadRequestException('Subtipo de incidencia no encontrado');
    if (record.deleted_at && !toggle) throw new BadRequestException('Subtipo de incidencia eliminado');
    return record;
  }
}
