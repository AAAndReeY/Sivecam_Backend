import { BadRequestException, Injectable } from '@nestjs/common';
import { Communal } from '@prisma/client';
import { CreateCommunalDto, FilterCommunalDto, UpdateCommunalDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { timezoneHelper } from '../../common/helpers';
import { getBrand, getMode } from './helpers';

@Injectable()
export class CommunalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCommunalDto): Promise<Communal> {
    const communal = await this.prisma.communal.create({
      data: {
        ...dto,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getCommunalById(communal.id);
  }

  async findAll(dto: FilterCommunalDto): Promise<any> {
    const { search, brand, mode } = dto;
    const where: any = { deleted_at: null };
    if (brand) where.brand = brand;
    if (mode) where.mode = mode;
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { neighbor: { contains: search, mode: 'insensitive' } },
      ];
    const communal = await this.prisma.communal.findMany({
      where,
      orderBy: { neighbor: 'asc' },
    });
    return {
      count: communal.length,
      data: communal,
    };
  }

  async findOne(id: string): Promise<Communal> {
    return await this.getCommunalById(id);
  }

  async update(id: string, dto: UpdateCommunalDto): Promise<Communal> {
    await this.getCommunalById(id);
    await this.prisma.communal.update({
      data: {
        ...dto,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return await this.getCommunalById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const communal = await this.getCommunalById(id, true);
    const inactive = communal.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.communal.update({
      data: {
        updated_at: timezoneHelper(),
        deleted_at,
      },
      where: { id },
    });
    return {
      action: inactive ? 'Restore' : 'Delete',
      id,
    };
  }

  async upload(file: Express.Multer.File) {
    const communal = await this.prisma.communal.findMany();
    if (communal.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const text = file.buffer.toString('utf8');
    const { features } = JSON.parse(text);
    const data = features.map((feat: any) => {
      const coordinates = feat.geometry.coordinates;
      const properties = feat.properties;
      return {
        address: properties.ubicacion,
        brand: getBrand(properties.marca),
        mode: getMode(properties.tipo),
        neighbor: properties.nombre.trim(),
        latitude: coordinates[1],
        longitude: coordinates[0],
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.communal.createMany({ data });
    return { success: true };
  }

  private async getCommunalById(id: string, toogle: boolean = false): Promise<any> {
    const communal = await this.prisma.communal.findUnique({
      where: { id },
    });
    if (!communal)
      throw new BadRequestException('Cámara vecinal no encontrada');
    if (communal.deleted_at && !toogle)
      throw new BadRequestException('Cámara vecinal eliminada');
    return communal;
  }
}
