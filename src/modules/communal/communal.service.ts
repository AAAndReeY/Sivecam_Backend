import { BadRequestException, Injectable } from '@nestjs/common';
import { Communal } from '@prisma/client';
import * as xlsx from 'xlsx';
import { CreateCommunalDto, FilterCommunalDto, UpdateCommunalDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { getBrand, getMode } from './helpers';

// Campos siempre incluidos: necesarios para el mapa (brand e id requeridos por iconos y filtros)
const ALWAYS_INCLUDE = ['id', 'latitude', 'longitude', 'brand', 'deleted_at', 'created_at', 'updated_at'];

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

  async findAll(dto: FilterCommunalDto, user: any): Promise<any> {
    const { search, brand, mode, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (brand) where.brand = brand;
    if (mode) where.mode = mode;
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { neighbor: { contains: search, mode: 'insensitive' } },
      ];
    const result = await paginationHelper(
      this.prisma.communal,
      { where, orderBy: { neighbor: 'asc' } },
      pagination,
    );
    const visibleFields = await this.getVisibleFields(user);
    if (visibleFields) {
      result.data = result.data.map((item: any) => this.applyFieldFilter(item, visibleFields));
    }
    return result;
  }

  async findOne(id: string, user: any): Promise<any> {
    const communal = await this.getCommunalById(id);
    const visibleFields = await this.getVisibleFields(user);
    return visibleFields ? this.applyFieldFilter(communal, visibleFields) : communal;
  }

  private async getVisibleFields(user: any): Promise<string[] | null> {
    if (!user?.custom_role_id) return null;
    const perm = await this.prisma.roleModulePermission.findUnique({
      where: {
        custom_role_id_module_key: {
          custom_role_id: user.custom_role_id,
          module_key: 'camaras-vecinales',
        },
      },
      select: { visible_fields: true },
    });
    if (!perm || perm.visible_fields.length === 0) return null;
    return perm.visible_fields;
  }

  private applyFieldFilter(item: any, visibleFields: string[]): any {
    const allowed = new Set([...ALWAYS_INCLUDE, ...visibleFields]);
    return Object.fromEntries(Object.entries(item).filter(([k]) => allowed.has(k)));
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
