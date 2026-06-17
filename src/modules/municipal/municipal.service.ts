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

// Campos siempre incluidos: posición, identificación y metadata del mapa
const ALWAYS_INCLUDE = ['id', 'name', 'latitude', 'longitude', 'camera', 'deleted_at', 'created_at', 'updated_at'];

// Campos derivados: algunos visible_fields activan campos adicionales del modelo
const FIELD_MAP: Record<string, string[]> = {
  vision: ['angle', 'radius'], // el ángulo y radio sólo se envían si el rol puede ver el cono
};

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

  async findAll(dto: FilterMunicipalDto, user: any): Promise<any> {
    const { search, camera, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (camera) where.camera = camera;
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    const result = await paginationHelper(
      this.prisma.municipal,
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
    const municipal = await this.getMunicipalById(id);
    const visibleFields = await this.getVisibleFields(user);
    return visibleFields ? this.applyFieldFilter(municipal, visibleFields) : municipal;
  }

  private async getVisibleFields(user: any): Promise<string[] | null> {
    if (!user?.custom_role_id) return null;
    const perm = await this.prisma.roleModulePermission.findUnique({
      where: {
        custom_role_id_module_key: {
          custom_role_id: user.custom_role_id,
          module_key: 'camaras-municipales',
        },
      },
      select: { visible_fields: true },
    });
    // visible_fields vacío = sin restricciones
    if (!perm || perm.visible_fields.length === 0) return null;
    return perm.visible_fields;
  }

  private applyFieldFilter(item: any, visibleFields: string[]): any {
    const extra: string[] = visibleFields.flatMap(f => FIELD_MAP[f] ?? []);
    const allowed = new Set([...ALWAYS_INCLUDE, ...visibleFields, ...extra]);
    return Object.fromEntries(Object.entries(item).filter(([k]) => allowed.has(k)));
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
    const count = await this.prisma.municipal.count();
    if (count !== 0)
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

  async angle(file: Express.Multer.File) {
    const text = file.buffer.toString('utf8');
    const municipal = JSON.parse(text);
    await Promise.all(
      municipal.features.map((camera: any) =>
        this.prisma.municipal.update({
          data: {
            angle: camera?.geometry.angle,
            updated_at: timezoneHelper(),
          },
          where: { name: camera?.properties?.name },
        }),
      ),
    );
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
