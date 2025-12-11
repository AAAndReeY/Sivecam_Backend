import { BadRequestException, Injectable } from '@nestjs/common';
import { Defense } from '@prisma/client';
import { CreateDefenseDto, UpdateDefenseDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { SearchDto } from '../../common/dto';

@Injectable()
export class DefenseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDefenseDto): Promise<Defense> {
    const defense = await this.prisma.defense.create({
      data: {
        ...dto,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getDefenseById(defense.id);
  }

  async findAll(dto: SearchDto): Promise<any> {
    const { search, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { place: { contains: search, mode: 'insensitive' } },
      ];
    return paginationHelper(
      this.prisma.defense,
      {
        where,
        orderBy: { place: 'asc' },
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<Defense> {
    return await this.getDefenseById(id);
  }

  async update(id: string, dto: UpdateDefenseDto): Promise<Defense> {
    await this.getDefenseById(id);
    await this.prisma.defense.update({
      data: {
        ...dto,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return await this.getDefenseById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const defense = await this.getDefenseById(id, true);
    const inactive = defense.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.defense.update({
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
    const defense = await this.prisma.defense.findMany();
    if (defense.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const text = file.buffer.toString('utf8');
    const result = JSON.parse(text);
    const data = result.map((res: any) => {
      return {
        address: res.Dirección,
        place: res.GIro,
        latitude: Number(res.Latitud),
        longitude: Number(res.Longitud),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.defense.createMany({ data });
    return { success: true };
  }

  private async getDefenseById(
    id: string,
    toogle: boolean = false,
  ): Promise<any> {
    const defense = await this.prisma.defense.findUnique({
      where: { id },
    });
    if (!defense) throw new BadRequestException('Paradero no encontrado');
    if (defense.deleted_at && !toogle)
      throw new BadRequestException('Paradero eliminado');
    return defense;
  }
}
