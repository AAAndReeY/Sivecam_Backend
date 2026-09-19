import { BadRequestException, Injectable } from '@nestjs/common';
import { Communal } from '@prisma/client';
import * as xlsx from 'xlsx';
import {
  CreateCommunalDto,
  FilterCommunalDto,
  UpdateCommunalDto,
  CommunalScope,
} from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { AuditService } from '../audit/audit.service';
import { getBrand, getMode } from './helpers';

// Campos siempre incluidos: necesarios para el mapa (brand e id requeridos por iconos y filtros)
const ALWAYS_INCLUDE = ['id', 'latitude', 'longitude', 'brand', 'deleted_at', 'created_at', 'updated_at'];

// Columnas del Excel del panel. El orden es el del reporte.
export const COMMUNAL_EXPORT_FIELDS = [
  'address', 'neighbor', 'brand', 'mode', 'phone', 'user', 'password', 'serial', 'latitude', 'longitude',
];

@Injectable()
export class CommunalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const { search, brand, mode, scope, ...pagination } = dto;
    const where = this.buildWhere({ search, brand, mode });
    const result = await paginationHelper(
      this.prisma.communal,
      { where, orderBy: { neighbor: 'asc' } },
      pagination,
    );
    const allowed = await this.getAllowedFields(user, scope ?? 'map');
    if (allowed) {
      result.data = result.data.map((item: any) => this.applyFieldFilter(item, allowed));
    }
    return result;
  }

  async findOne(id: string, user: any, scope: CommunalScope = 'map'): Promise<any> {
    const communal = await this.getCommunalById(id);
    const allowed = await this.getAllowedFields(user, scope);
    return this.applyFieldFilter(communal, allowed);
  }

  /**
   * Descarga completa para el Excel del panel. Va por su propio module_key
   * ('camaras-vecinales-export') en el guard, de modo que se puede conceder a un
   * rol sin darle el resto del panel — y al reves. Queda registrado en auditoria
   * porque el archivo puede contener credenciales de las camaras.
   */
  async exportAll(dto: FilterCommunalDto, user: any): Promise<any> {
    const { search, brand, mode } = dto;
    const rows = await this.prisma.communal.findMany({
      where: this.buildWhere({ search, brand, mode }),
      orderBy: { neighbor: 'asc' },
    });
    const allowed = await this.getAllowedFields(user, 'manage');
    const data = rows.map((item: any) => this.applyFieldFilter(item, allowed));
    const columns = COMMUNAL_EXPORT_FIELDS.filter(f => !allowed || allowed.includes(f));

    await this.audit.log({
      action: 'EXPORT',
      entity: 'Communal',
      entity_id: user?.user_id ?? 'unknown',
      changes: {
        registros: data.length,
        columnas: columns,
        incluye_credenciales: columns.includes('password') || columns.includes('user'),
      },
      performed_by: user?.username,
    });

    return { data, columns, totalCount: data.length };
  }

  private buildWhere({ search, brand, mode }: Partial<FilterCommunalDto>): any {
    const where: any = { deleted_at: null };
    if (brand) where.brand = brand;
    if (mode) where.mode = mode;
    if (search)
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { neighbor: { contains: search, mode: 'insensitive' } },
      ];
    return where;
  }

  /**
   * Lista blanca de campos para el rol. `null` = sin restriccion.
   * El mapa lee `visible_fields`; el panel administrativo lee `export_fields`.
   */
  private async getAllowedFields(user: any, scope: CommunalScope): Promise<string[] | null> {
    if (!user?.custom_role_id || user.system_slug === 'SUPERADMIN') return null;
    const perm = await this.prisma.roleModulePermission.findUnique({
      where: {
        custom_role_id_module_key: {
          custom_role_id: user.custom_role_id,
          module_key: 'camaras-vecinales',
        },
      },
      select: { visible_fields: true, export_fields: true },
    });
    if (!perm) return null;
    const fields = scope === 'manage' ? perm.export_fields : perm.visible_fields;
    return fields.length === 0 ? null : fields;
  }

  private applyFieldFilter(item: any, allowed: string[] | null): any {
    if (!allowed) return item;
    const permitidos = new Set([...ALWAYS_INCLUDE, ...allowed]);
    return Object.fromEntries(Object.entries(item).filter(([k]) => permitidos.has(k)));
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
    const count = await this.prisma.communal.count();
    if (count !== 0)
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
