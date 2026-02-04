import { BadRequestException, Injectable } from '@nestjs/common';
import { Activity } from '@prisma/client';
import * as xlsx from 'xlsx';
import { CreateActivityDto, UpdateActivityDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { parseNumberDate, parseStringDate, paginationHelper, timezoneHelper } from '../../common/helpers';
import { SearchDto } from '../../common/dto';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateActivityDto): Promise<Activity> {
    const { done_at, ...res } = dto;
    const activity = await this.prisma.activity.create({
      data: {
        ...res,
        done_at: parseStringDate(done_at),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getActivityById(activity.id);
  }

  async findAll(dto: SearchDto): Promise<any> {
    const { search, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search)
      where.OR = [
        { act_type: { contains: search, mode: 'insensitive' } },    
        { address: { contains: search, mode: 'insensitive' } },
        { representative: { contains: search, mode: 'insensitive' } },
      ];
    return paginationHelper(
      this.prisma.activity,
      {
        where,
        orderBy: { done_at: 'desc' },
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<Activity> {
    return await this.getActivityById(id);
  }

  async update(id: string, dto: UpdateActivityDto): Promise<Activity> {
    await this.getActivityById(id);
    await this.prisma.activity.update({
      data: {
        ...dto,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return await this.getActivityById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const activity = await this.getActivityById(id, true);
    const inactive = activity.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.activity.update({
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
    const activity = await this.prisma.activity.findMany();
    if (activity.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const data = rows.map((row: any) => {
      const location: any[] = row.location.split(', ');
      return {
        description: String(row.description),
        address: String(row.address),
        act_type: String(row.act_type),
        observation: String(row.observation),
        latitude: Number(location[0]),
        longitude: Number(location[1]),
        done_at: parseNumberDate(row.date),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.activity.createMany({ data });
    return { success: true };
  }

  private async getActivityById(
    id: string,
    toogle: boolean = false,
  ): Promise<any> {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
    });
    if (!activity)
      throw new BadRequestException('Actividad no encontrada');
    if (activity.deleted_at && !toogle)
      throw new BadRequestException('Actividad eliminada');
    return activity;
  }
}
