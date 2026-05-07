import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user.system_slug === 'SUPERADMIN') return true;
    // Todos los usuarios tienen custom_role_id; CustomRoleGuard evalúa sus permisos
    if (user.custom_role_id) return true;
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles) return requiredRoles.includes(user.system_slug);
    return user.system_slug !== 'VIEWER' && user.system_slug !== 'CODISEC';
  }
}
