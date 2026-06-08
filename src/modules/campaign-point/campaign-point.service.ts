import { BadRequestException, Injectable } from '@nestjs/common';
import { CampaignPoint } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import {
  CreateCampaignPointDto,
  FilterCampaignPointDto,
  UpdateCampaignPointDto,
} from './dto';

@Injectable()
export class CampaignPointService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCampaignPointDto): Promise<CampaignPoint> {
    const point = await this.prisma.campaignPoint.create({
      data: {
        ...dto,
        geom_type: dto.geom_type ?? 'POINT',
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return this.getById(point.id);
  }

  async findAll(dto: FilterCampaignPointDto): Promise<any> {
    const { search, category, ...pagination } = dto;
    const where: any = { deleted_at: null };

    if (category) where.category = category;
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];

    return paginationHelper(
      this.prisma.campaignPoint,
      { where, orderBy: [{ category: 'asc' }, { name: 'asc' }] },
      pagination,
    );
  }

  async findOne(id: string): Promise<CampaignPoint> {
    return this.getById(id);
  }

  async update(id: string, dto: UpdateCampaignPointDto): Promise<CampaignPoint> {
    await this.getById(id);
    await this.prisma.campaignPoint.update({
      data: { ...dto, updated_at: timezoneHelper() },
      where: { id },
    });
    return this.getById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const point = await this.getById(id, true);
    const deleted_at = point.deleted_at ? null : timezoneHelper();
    await this.prisma.campaignPoint.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });
    return { action: point.deleted_at ? 'Restore' : 'Delete', id };
  }

  async categories() {
    const rows = await this.prisma.campaignPoint.findMany({
      where: { deleted_at: null },
      select: { category: true, color: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return rows;
  }

  private async getById(id: string, toggle = false): Promise<any> {
    const point = await this.prisma.campaignPoint.findUnique({ where: { id } });
    if (!point) throw new BadRequestException('Punto de campaña no encontrado');
    if (point.deleted_at && !toggle)
      throw new BadRequestException('Punto de campaña eliminado');
    return point;
  }
}
