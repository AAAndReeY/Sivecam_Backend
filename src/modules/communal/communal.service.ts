import { BadRequestException, Injectable } from '@nestjs/common';
import { Communal } from '@prisma/client';
import * as xlsx from 'xlsx';
import { CreateCommunalDto, FilterCommunalDto, UpdateCommunalDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
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
    const { search, brand, mode, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (brand) where.brand = brand;
    if (mode) where.mode = mode;
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { neighbor: { contains: search, mode: 'insensitive' } },
      ];
    return paginationHelper(
      this.prisma.communal,
      {
        where,
        orderBy: { neighbor: 'asc' },
      },
      pagination,
    );
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
    const communal = await this.prisma.municipal.findMany();
    if (communal.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const data = rows.map((row: any) => {
      return {
        address: row.address,
        brand: row.brand,
        mode: row.mode,
        neighbor: row.neighbor,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        user: row.user ?? null,
        password: row.password ? String(String(row.password)) : null,
        serial: row.serial ?? null,
        phone: row.phone ?? null,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.communal.createMany({ data });
    return { success: true };
  }

  private async getCommunalById(
    id: string,
    toogle: boolean = false,
  ): Promise<any> {
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
