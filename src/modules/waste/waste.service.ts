import { BadRequestException, Injectable } from '@nestjs/common';
import { Color, Waste } from '@prisma/client';
import { CreateWasteDto, FilterWasteDto, UpdateWasteDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';

@Injectable()
export class WasteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWasteDto): Promise<Waste> {
    const waste = await this.prisma.waste.create({
      data: {
        ...dto,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getWasteById(waste.id);
  }

  async findAll(dto: FilterWasteDto): Promise<any> {
    const { search, color, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (color) where.color = color;
    if (search)
      where.OR = [{ name: { contains: search, mode: 'insensitive' } }];
    return paginationHelper(
      this.prisma.waste,
      {
        where,
        orderBy: { name: 'asc' },
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<Waste> {
    return await this.getWasteById(id);
  }

  async update(id: string, dto: UpdateWasteDto): Promise<Waste> {
    await this.getWasteById(id);
    await this.prisma.waste.update({
      data: {
        ...dto,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return await this.getWasteById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const waste = await this.getWasteById(id, true);
    const inactive = waste.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.waste.update({
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
    const waste = await this.prisma.waste.findMany();
    if (waste.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const text = file.buffer.toString('utf8');
    const result = JSON.parse(text);
    const data = result.map((res: any) => {
      return {
        name: res.nombre,
        color: res.id_tipo === 'verde' ? Color.GREEN : Color.YELLOW,
        latitude: Number(res.latitud),
        longitude: Number(res.longitud),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.waste.createMany({ data });
    return { success: true };
  }

  private async getWasteById(
    id: string,
    toogle: boolean = false,
  ): Promise<any> {
    const waste = await this.prisma.waste.findUnique({
      where: { id },
    });
    if (!waste) throw new BadRequestException('Residuo sólido no encontrado');
    if (waste.deleted_at && !toogle)
      throw new BadRequestException('Residuo sólido eliminado');
    return waste;
  }
}
