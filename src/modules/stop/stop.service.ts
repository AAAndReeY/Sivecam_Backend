import { BadRequestException, Injectable } from '@nestjs/common';
import { Stop } from '@prisma/client';
import { CreateStopDto, FilterStopDto, UpdateStopDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';

@Injectable()
export class StopService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStopDto): Promise<Stop> {
    const stop = await this.prisma.stop.create({
      data: {
        ...dto,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getStopById(stop.id);
  }

  async findAll(dto: FilterStopDto): Promise<any> {
    const { search, authorized, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (authorized) where.authorized = authorized === 'true' ? true : false;
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    return paginationHelper(
      this.prisma.stop,
      {
        where,
        orderBy: { name: 'asc' },
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<Stop> {
    return await this.getStopById(id);
  }

  async update(id: string, dto: UpdateStopDto): Promise<Stop> {
    await this.getStopById(id);
    await this.prisma.stop.update({
      data: {
        ...dto,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return await this.getStopById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const stop = await this.getStopById(id, true);
    const inactive = stop.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.stop.update({
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

  async upload(file: Express.Multer.File, dto: any) {
    const { authorized } = dto;
    const stop = await this.prisma.stop.findMany({
      where: {
        authorized: authorized === 'true' ? true : false,
      },
    });
    if (stop.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const text = file.buffer.toString('utf8');
    const result = JSON.parse(text);
    const data = result.features.map((res: any) => {
      return {
        name: String(res.properties.name),
        address: res.properties.description,
        latitude: Number(res.geometry.coordinates[1]),
        longitude: Number(res.geometry.coordinates[0]),
        authorized: authorized === 'true' ? true : false,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.stop.createMany({ data });
    return { success: true };
  }

  private async getStopById(id: string, toogle: boolean = false): Promise<any> {
    const stop = await this.prisma.stop.findUnique({
      where: { id },
    });
    if (!stop) throw new BadRequestException('Paradero no encontrado');
    if (stop.deleted_at && !toogle)
      throw new BadRequestException('Paradero eliminado');
    return stop;
  }
}
