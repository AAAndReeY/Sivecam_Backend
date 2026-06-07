import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FilterCampaignPointDto } from './dto';

@Injectable()
export class CampaignPointService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: FilterCampaignPointDto) {
    const { search, category } = dto;
    const where: any = { deleted_at: null };

    if (category) where.category = category;
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];

    return this.prisma.campaignPoint.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        lat: true,
        lng: true,
        polygon: true,
        geom_type: true,
        color: true,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.campaignPoint.findFirst({
      where: { id, deleted_at: null },
    });
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
}
