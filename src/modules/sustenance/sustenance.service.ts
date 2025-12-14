import { BadRequestException, Injectable } from '@nestjs/common';
import { Sustenance } from '@prisma/client';
import { CreateSustenanceDto, UpdateSustenanceDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { SearchDto } from '../../common/dto';

@Injectable()
export class SustenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSustenanceDto): Promise<Sustenance> {
    const sustenance = await this.prisma.sustenance.create({
      data: {
        ...dto,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getSustenanceById(sustenance.id);
  }

  async findAll(dto: SearchDto): Promise<any> {
    const { search, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    return paginationHelper(
      this.prisma.sustenance,
      {
        where,
        orderBy: { name: 'asc' },
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<Sustenance> {
    return await this.getSustenanceById(id);
  }

  async update(id: string, dto: UpdateSustenanceDto): Promise<Sustenance> {
    await this.getSustenanceById(id);
    await this.prisma.sustenance.update({
      data: {
        ...dto,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return await this.getSustenanceById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const sustenance = await this.getSustenanceById(id, true);
    const inactive = sustenance.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.sustenance.update({
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
    const sustenance = await this.prisma.sustenance.findMany();
    if (sustenance.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const text = file.buffer.toString('utf8');
    const result = JSON.parse(text);
    const data = result.features.map((res: any) => {
      return {
        name: String(res.properties.nombre),
        address: res.properties.ubicacion,
        latitude: Number(res.geometry.coordinates[1]),
        longitude: Number(res.geometry.coordinates[0]),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.sustenance.createMany({ data });
    return { success: true };
  }

  private async getSustenanceById(
    id: string,
    toogle: boolean = false,
  ): Promise<any> {
    const sustenance = await this.prisma.sustenance.findUnique({
      where: { id },
    });
    if (!sustenance)
      throw new BadRequestException('Sostenimiento no encontrado');
    if (sustenance.deleted_at && !toogle)
      throw new BadRequestException('Sostenimiento eliminado');
    return sustenance;
  }
}
