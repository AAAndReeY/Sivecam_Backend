import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { CreateCustomRoleDto, FilterCustomRoleDto, UpdateCustomRoleDto } from './dto';

type Caller = { system_slug: string | null; username: string };

@Injectable()
export class CustomRoleService {
  private readonly include = {
    module_permissions: {
      select: { module_key: true, can_access: true, can_create: true, can_edit: true, can_delete: true, visible_fields: true },
    },
    layer_permissions: {
      select: { layer_key: true },
    },
    _count: { select: { users: true } },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCustomRoleDto, caller?: Caller) {
    try {
      const role = await this.prisma.customRole.create({
        data: {
          name: dto.name,
          description: dto.description,
          allowed_jurisdictions: dto.allowed_jurisdictions ?? [],
          created_at: timezoneHelper(),
          updated_at: timezoneHelper(),
          module_permissions: {
            create: (dto.modules ?? []).map(m => ({
              module_key:     m.module_key,
              can_access:     m.can_access     ?? true,
              can_create:     m.can_create     ?? false,
              can_edit:       m.can_edit       ?? false,
              can_delete:     m.can_delete     ?? false,
              visible_fields: m.visible_fields ?? [],
            })),
          },
          layer_permissions: {
            create: (dto.layers ?? []).map(l => ({ layer_key: l.layer_key })),
          },
        },
        include: this.include,
      });

      await this.audit.log({
        action: 'CREATE',
        entity: 'CustomRole',
        entity_id: role.id,
        changes: { name: dto.name },
        performed_by: caller?.username,
      });

      return role;
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  async findAll(dto: FilterCustomRoleDto) {
    const { search, ...pagination } = dto;
    const where: Prisma.CustomRoleWhereInput = { deleted_at: null };
    if (search) {
      where.OR = [
        { name:        { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    return paginationHelper(
      this.prisma.customRole,
      { where, include: this.include, orderBy: { name: 'asc' } },
      pagination,
    );
  }

  async findOne(id: string) {
    return this.getRoleById(id);
  }

  async update(id: string, dto: UpdateCustomRoleDto, caller?: Caller) {
    await this.getRoleById(id);
    try {
      const role = await this.prisma.customRole.update({
        where: { id },
        data: {
          name:                 dto.name,
          description:          dto.description,
          allowed_jurisdictions: dto.allowed_jurisdictions ?? [],
          updated_at:           timezoneHelper(),
          ...(dto.modules !== undefined && {
            module_permissions: {
              deleteMany: {},
              create: dto.modules.map(m => ({
                module_key:     m.module_key,
                can_access:     m.can_access     ?? true,
                can_create:     m.can_create     ?? false,
                can_edit:       m.can_edit       ?? false,
                can_delete:     m.can_delete     ?? false,
                visible_fields: m.visible_fields ?? [],
              })),
            },
          }),
          ...(dto.layers !== undefined && {
            layer_permissions: {
              deleteMany: {},
              create: dto.layers.map(l => ({ layer_key: l.layer_key })),
            },
          }),
        },
        include: this.include,
      });

      await this.audit.log({
        action: 'UPDATE',
        entity: 'CustomRole',
        entity_id: id,
        changes: { name: dto.name },
        performed_by: caller?.username,
      });

      return role;
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  async toggleDelete(id: string, caller?: Caller) {
    const role = await this.getRoleById(id, true);
    const deleted_at = role.deleted_at ? null : timezoneHelper();
    await this.prisma.customRole.update({
      where: { id },
      data: { deleted_at, updated_at: timezoneHelper() },
    });
    const action = role.deleted_at ? 'RESTORE' : 'DELETE';
    await this.audit.log({
      action,
      entity: 'CustomRole',
      entity_id: id,
      changes: { name: role.name },
      performed_by: caller?.username,
    });
    return { action, id };
  }

  // ── Crea/sincroniza todos los roles base y los asigna a usuarios sin rol personalizado ──
  async seedDefaultRoles() {
    // Subtipos individuales de patrimonio
    const ROBO_KEYS   = ['roboPersonas','roboCasa','roboGanado','roboEmpresas','roboVehiculos','roboAutopartes','roboPasajeros'];
    const HURTO_KEYS  = ['hurtoPersonas','hurtoCasa','hurtoGanado','hurtoEmpresas','hurtoVehiculos','hurtoPasajeros'];
    const PATRIMONIO_KEYS = [...ROBO_KEYS, ...HURTO_KEYS, 'danos'];

    const ALL_LAYERS = [
      'camaras','camarasVecinales','jurisdicciones','zonasCodisec',
      'paraderosAutorizados','paraderosNoAutorizados','defensaCivil','residuos',
      'sostenimiento','actividades',
      // Incidencias Serenos — subtipos individuales
      ...PATRIMONIO_KEYS,
      'extorsiones','homicidios','feminicidios','sicariatos','secuestros','drogas','barras',
      // Incidencias PNP
      'pnpRoboAlPaso','pnpRoboAgravado','pnpDrogas','pnpViolenciaFamiliar',
      'pnpAccidente','pnpViolenciaSexual','pnpHomicidio','pnpLesiones',
      'pnpHurto','pnpOtros',
      // Herramientas
      'busquedaDirecciones','ubicadorPunto','rutas','clusters','clusterCombinado','clusterPNP','comisarias',
    ];
    const TOOLS = ['busquedaDirecciones','ubicadorPunto','rutas','clusters','clusterCombinado'];
    const BASE_LAYERS = ['camaras','camarasVecinales','jurisdicciones','zonasCodisec','comisarias',...TOOLS];
    const SERENOS_LAYERS = [...new Set([
      ...BASE_LAYERS,'actividades',
      ...PATRIMONIO_KEYS,
      'extorsiones','homicidios','feminicidios','sicariatos','secuestros','drogas','barras',
      'clusters','clusterCombinado',
    ])];
    const PNP_LAYERS = [...BASE_LAYERS,'pnpRoboAlPaso','pnpRoboAgravado','pnpDrogas','pnpViolenciaFamiliar','pnpAccidente','pnpViolenciaSexual','pnpHomicidio','pnpLesiones','pnpHurto','pnpOtros','clusterPNP'];
    const ALL_MODULES = ['camaras-municipales','camaras-vecinales','actividades','incidencias-pnp','dashboard-serenos','dashboard-pnp','reportes-incidencias','auditoria','usuarios','roles','comisarias'];

    const defaults: Array<{
      slug: string; name: string; system_slug: string; description: string;
      modules: string[]; layers: string[];
      cameraFields?: { municipal?: string[]; vecinal?: string[] };
    }> = [
      {
        slug: 'rol-superadmin',
        name: 'Superadmin',
        system_slug: 'SUPERADMIN',
        description: 'Acceso total al sistema sin ninguna restricción',
        modules: ALL_MODULES,
        layers: ALL_LAYERS,
        cameraFields: { municipal: [], vecinal: [] },
      },
      {
        slug: 'rol-administrador',
        name: 'Administrador',
        system_slug: 'ADMINISTRATOR',
        description: 'Acceso completo a módulos administrativos y todas las capas',
        modules: ALL_MODULES,
        layers: ALL_LAYERS,
        cameraFields: { municipal: [], vecinal: [] },
      },
      {
        slug: 'rol-supervisor',
        name: 'Supervisor',
        system_slug: 'SUPERVISOR',
        description: 'Gestión de actividades y dashboard de serenos',
        modules: ['camaras-municipales','camaras-vecinales','actividades','dashboard-serenos','reportes-incidencias'],
        layers: SERENOS_LAYERS,
        cameraFields: {
          municipal: ['address','buttom','megaphone'],
          vecinal:   ['address','neighbor','brand','mode','phone'],
        },
      },
      {
        slug: 'rol-codisec',
        name: 'CODISEC',
        system_slug: 'CODISEC',
        description: 'Actividades y dashboard de serenos',
        modules: ['camaras-municipales','camaras-vecinales','actividades','dashboard-serenos','reportes-incidencias'],
        layers: SERENOS_LAYERS,
        cameraFields: {
          municipal: ['address','buttom','megaphone'],
          vecinal:   ['address','neighbor'],
        },
      },
      {
        slug: 'rol-operador',
        name: 'Operador',
        system_slug: 'OPERATOR',
        description: 'Acceso al mapa con capas de cámaras e incidencias',
        modules: ['camaras-municipales','camaras-vecinales'],
        layers: BASE_LAYERS,
        cameraFields: {
          municipal: ['address','buttom','megaphone'],
          vecinal:   ['address','neighbor'],
        },
      },
      {
        slug: 'rol-visualizador',
        name: 'Visualizador',
        system_slug: 'VIEWER',
        description: 'Solo visualización del mapa con capas básicas',
        modules: ['camaras-municipales','camaras-vecinales'],
        layers: ['jurisdicciones','zonasCodisec','busquedaDirecciones','ubicadorPunto'],
        cameraFields: {
          municipal: ['address'],
          vecinal:   ['address'],
        },
      },
      {
        slug: 'rol-pnp',
        name: 'PNP',
        system_slug: 'PNP',
        description: 'Incidencias PNP y dashboard PNP',
        modules: ['camaras-municipales','camaras-vecinales','incidencias-pnp','dashboard-pnp'],
        layers: PNP_LAYERS,
        cameraFields: {
          municipal: ['address','buttom','megaphone'],
          vecinal:   ['address','neighbor'],
        },
      },
    ];

    const createdIds: Record<string, string> = {};

    for (const def of defaults) {
      const moduleCreate = def.modules.map(m => ({
        module_key: m,
        can_access: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
        visible_fields: m === 'camaras-municipales'
          ? (def.cameraFields?.municipal ?? [])
          : m === 'camaras-vecinales'
            ? (def.cameraFields?.vecinal ?? [])
            : [],
      }));

      // Buscar por system_slug o nombre
      const existing = await this.prisma.customRole.findFirst({
        where: { OR: [{ system_slug: def.system_slug }, { name: def.name }] },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.customRole.update({
          where: { id: existing.id },
          data: {
            deleted_at: null,
            name: def.name,
            system_slug: def.system_slug,
            description: def.description,
            updated_at: timezoneHelper(),
            module_permissions: { deleteMany: {}, create: moduleCreate },
            layer_permissions:  { deleteMany: {}, create: def.layers.map(l => ({ layer_key: l })) },
          },
        });
        createdIds[def.slug] = existing.id;
        continue;
      }

      try {
        const created = await this.prisma.customRole.create({
          data: {
            name: def.name,
            system_slug: def.system_slug,
            description: def.description,
            created_at: timezoneHelper(),
            updated_at: timezoneHelper(),
            module_permissions: { create: moduleCreate },
            layer_permissions:  { create: def.layers.map(l => ({ layer_key: l })) },
          },
          select: { id: true },
        });
        createdIds[def.slug] = created.id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const found = await this.prisma.customRole.findFirst({
            where: { OR: [{ system_slug: def.system_slug }, { name: def.name }] },
            select: { id: true },
          });
          if (found) createdIds[def.slug] = found.id;
        } else {
          throw e;
        }
      }
    }

    return { created: Object.keys(createdIds).length };
  }

  async getMyPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { custom_role_id: true },
    });
    if (!user?.custom_role_id) return null;
    return this.getRoleById(user.custom_role_id);
  }

  private async getRoleById(id: string, toggle = false) {
    const role = await this.prisma.customRole.findUnique({
      where: { id },
      include: this.include,
    });
    if (!role) throw new BadRequestException('Rol personalizado no encontrado');
    if (role.deleted_at && !toggle) throw new BadRequestException('Rol personalizado eliminado');
    return role;
  }

  private handlePrismaError(e: any): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Ya existe un rol con ese nombre');
    }
    throw e;
  }
}
