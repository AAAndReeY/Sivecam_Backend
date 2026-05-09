import { BadRequestException, Injectable } from '@nestjs/common';
import { Comisaria } from '@prisma/client';
import { CreateComisariaDto, UpdateComisariaDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { SearchDto } from '../../common/dto';

const ALWAYS_INCLUDE = ['id', 'latitude', 'longitude', 'deleted_at', 'created_at', 'updated_at'];

@Injectable()
export class ComisariaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateComisariaDto): Promise<Comisaria> {
    const comisaria = await this.prisma.comisaria.create({
      data: {
        ...dto,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getComisariaById(comisaria.id);
  }

  async findAll(dto: SearchDto, user: any): Promise<any> {
    const { search, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search)
      where.OR = [{ name: { contains: search, mode: 'insensitive' } }];
    const result = await paginationHelper(
      this.prisma.comisaria,
      { where, orderBy: { name: 'asc' } },
      pagination,
    );
    const visibleFields = await this.getVisibleFields(user);
    if (visibleFields) {
      result.data = result.data.map((item: any) => this.applyFieldFilter(item, visibleFields));
    }
    return result;
  }

  async findOne(id: string, user: any): Promise<any> {
    const comisaria = await this.getComisariaById(id);
    const visibleFields = await this.getVisibleFields(user);
    return visibleFields ? this.applyFieldFilter(comisaria, visibleFields) : comisaria;
  }

  async update(id: string, dto: UpdateComisariaDto): Promise<Comisaria> {
    await this.getComisariaById(id);
    await this.prisma.comisaria.update({
      data: { ...dto, updated_at: timezoneHelper() },
      where: { id },
    });
    return await this.getComisariaById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const comisaria = await this.getComisariaById(id, true);
    const inactive = comisaria.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.comisaria.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });
    return { action: inactive ? 'Restore' : 'Delete', id };
  }

  private async getVisibleFields(user: any): Promise<string[] | null> {
    if (!user?.custom_role_id) return null;
    const perm = await this.prisma.roleModulePermission.findUnique({
      where: {
        custom_role_id_module_key: {
          custom_role_id: user.custom_role_id,
          module_key: 'comisarias',
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

  private async getComisariaById(id: string, toggle = false): Promise<any> {
    const comisaria = await this.prisma.comisaria.findUnique({ where: { id } });
    if (!comisaria) throw new BadRequestException('Comisaría no encontrada');
    if (comisaria.deleted_at && !toggle) throw new BadRequestException('Comisaría eliminada');
    return comisaria;
  }
}
