import { BadRequestException, Injectable } from '@nestjs/common';
import { Municipal } from '@prisma/client';
import * as xlsx from 'xlsx';
import {
  CreateMunicipalDto,
  FilterMunicipalDto,
  UpdateMunicipalDto,
} from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';

@Injectable()
export class MunicipalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMunicipalDto): Promise<Municipal> {
    const municipal = await this.prisma.municipal.create({
      data: {
        ...dto,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getMunicipalById(municipal.id);
  }

  async findAll(dto: FilterMunicipalDto): Promise<any> {
    const { search, camera, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (camera) where.camera = camera;
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    return paginationHelper(
      this.prisma.municipal,
      {
        where,
        orderBy: { name: 'asc' },
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<Municipal> {
    return await this.getMunicipalById(id);
  }

  async update(id: string, dto: UpdateMunicipalDto): Promise<Municipal> {
    await this.getMunicipalById(id);
    await this.prisma.municipal.update({
      data: {
        ...dto,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return await this.getMunicipalById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const municipal = await this.getMunicipalById(id, true);
    const inactive = municipal.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.municipal.update({
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
    const municipal = await this.prisma.municipal.findMany();
    if (municipal.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const data = rows.map((row: any) => {
      return {
        name: String(row.name),
        address: row.address,
        camera: row.camera,
        latitude: row.latitude,
        longitude: row.longitude,
        buttom: row.buttom ? true : false,
        megaphone: row.megaphone ? true : false,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.municipal.createMany({ data });
    return { success: true };
  }

  async radius(file: Express.Multer.File) {
    const text = file.buffer.toString('utf8');
    const municipal = JSON.parse(text);
    for (const camera of municipal.features) {
      await this.prisma.municipal.update({
        data: {
          //geometry: camera?.geometry,
          updated_at: timezoneHelper(),
        },
        where: { name: camera?.properties?.name },
      });
    }
    return { success: true };
  }

  async angle(file: Express.Multer.File) {
    const text = file.buffer.toString('utf8');
    const municipal = JSON.parse(text);
    for (const camera of municipal.features) {
      await this.prisma.municipal.update({
        data: {
          angle: camera?.geometry.angle,
          updated_at: timezoneHelper(),
        },
        where: { name: camera?.properties?.name },
      });
    }
    return { success: true };
  }

  private async getMunicipalById(
    id: string,
    toogle: boolean = false,
  ): Promise<any> {
    const municipal = await this.prisma.municipal.findUnique({
      where: { id },
    });
    if (!municipal)
      throw new BadRequestException('Cámara municipal no encontrada');
    if (municipal.deleted_at && !toogle)
      throw new BadRequestException('Cámara municipal eliminada');
    return municipal;
  }
}
