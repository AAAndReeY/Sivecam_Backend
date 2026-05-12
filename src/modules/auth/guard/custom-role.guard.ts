import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { MODULE_KEY, MODULE_OP, LAYER_KEY, ModuleOperation } from './module-key.decorator';

@Injectable()
export class CustomRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    if (user.system_slug === 'SUPERADMIN') return true;

    const moduleKey = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const layerKey = this.reflector.getAllAndOverride<string>(LAYER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const operation = this.reflector.getAllAndOverride<ModuleOperation>(MODULE_OP, [
      context.getHandler(),
      context.getClass(),
    ]) ?? 'read';

    if (user.custom_role_id) {
      // Acceso por capa (datos del mapa)
      if (layerKey) {
        const layerPerm = await this.prisma.roleLayerPermission.findFirst({
          where: { custom_role_id: user.custom_role_id, layer_key: layerKey },
        });
        if (!layerPerm) {
          // Fallback: usuarios con incidencias-pnp pueden leer comisarías (necesario para el formulario)
          if (layerKey === 'comisarias' && operation === 'read') {
            const hasPnpAccess = await this.prisma.roleModulePermission.findFirst({
              where: { custom_role_id: user.custom_role_id, module_key: 'incidencias-pnp', can_access: true },
            });
            if (hasPnpAccess) return true;
          }
          throw new ForbiddenException('No tienes acceso a esta capa');
        }
        return true;
      }

      // Acceso por módulo (paneles administrativos)
      if (!moduleKey) return true;

      const perm = await this.prisma.roleModulePermission.findUnique({
        where: {
          custom_role_id_module_key: {
            custom_role_id: user.custom_role_id,
            module_key: moduleKey,
          },
        },
        select: { can_create: true, can_edit: true, can_delete: true },
      });

      if (!perm) {
        if (operation === 'read') {
          // Fallback para lectura de cámaras: si tiene la capa equivalente, permitir
          const layerFallback: Record<string, string> = {
            'camaras-municipales': 'camaras',
            'camaras-vecinales':   'camarasVecinales',
          };
          const fallbackLayer = layerFallback[moduleKey];
          if (fallbackLayer) {
            const layerPerm = await this.prisma.roleLayerPermission.findFirst({
              where: { custom_role_id: user.custom_role_id, layer_key: fallbackLayer },
            });
            if (layerPerm) return true;
          }

          // Fallback de lectura: módulos que requieren leer catálogos de otro módulo
          const readFallbackMap: Record<string, string[]> = {
            // catálogo requerido → módulos que otorgan acceso de lectura
            'tipos-incidencia':       ['incidencias-pnp', 'subtipos-incidencia', 'modalidades-incidencia'],
            'subtipos-incidencia':    ['incidencias-pnp', 'modalidades-incidencia'],
            'modalidades-incidencia': ['incidencias-pnp'],
            'comisarias':             ['incidencias-pnp'],
            'roles':                  ['usuarios'],
          };
          const fallbackParents = readFallbackMap[moduleKey];
          if (fallbackParents) {
            const hasParentAccess = await this.prisma.roleModulePermission.findFirst({
              where: {
                custom_role_id: user.custom_role_id,
                module_key: { in: fallbackParents },
                can_access: true,
              },
            });
            if (hasParentAccess) return true;
          }
        }
        throw new ForbiddenException('No tienes acceso a este módulo');
      }

      if (operation === 'create' && !perm.can_create)
        throw new ForbiddenException('No tienes permiso para crear en este módulo');
      if (operation === 'edit' && !perm.can_edit)
        throw new ForbiddenException('No tienes permiso para editar en este módulo');
      if (operation === 'delete' && !perm.can_delete)
        throw new ForbiddenException('No tienes permiso para eliminar en este módulo');

      return true;
    }

    // Fallback para usuarios sin custom_role_id (no debería ocurrir tras el seed)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles) return requiredRoles.includes(user.system_slug);

    return false;
  }
}
