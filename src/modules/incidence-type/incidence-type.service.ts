import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { SearchDto } from '../../common/dto';
import { CreateIncidenceTypeDto, UpdateIncidenceTypeDto } from './dto';

@Injectable()
export class IncidenceTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIncidenceTypeDto) {
    const exists = await this.prisma.incidenceType.findUnique({ where: { name: dto.name } });
    if (exists) throw new BadRequestException('Ya existe un tipo con ese nombre');
    const record = await this.prisma.incidenceType.create({
      data: { ...dto, created_at: timezoneHelper(), updated_at: timezoneHelper() },
    });
    return this.getById(record.id);
  }

  async findAll(dto: SearchDto) {
    const { search, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    return paginationHelper(
      this.prisma.incidenceType,
      { where, orderBy: { name: 'asc' } },
      pagination,
    );
  }

  async findOne(id: string) {
    return this.getById(id);
  }

  async update(id: string, dto: UpdateIncidenceTypeDto) {
    await this.getById(id);
    await this.prisma.incidenceType.update({
      data: { ...dto, updated_at: timezoneHelper() },
      where: { id },
    });
    return this.getById(id);
  }

  async toggleDelete(id: string) {
    const record = await this.getById(id, true);
    const deleted_at = record.deleted_at ? null : timezoneHelper();
    await this.prisma.incidenceType.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });
    return { action: record.deleted_at ? 'Restore' : 'Delete', id };
  }

  private async getById(id: string, toggle = false) {
    const record = await this.prisma.incidenceType.findUnique({ where: { id } });
    if (!record) throw new BadRequestException('Tipo de incidencia no encontrado');
    if (record.deleted_at && !toggle) throw new BadRequestException('Tipo de incidencia eliminado');
    return record;
  }
}
