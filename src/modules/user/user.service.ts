import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto, FilterUserDto, UpdateUserDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';

type Caller = { rol: string; username: string };

@Injectable()
export class UserService {
  private select = {
    id: true,
    name: true,
    lastname: true,
    username: true,
    email: true,
    dni: true,
    phone: true,
    rol: true,
    deleted_at: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, caller?: Caller): Promise<User> {
    if (dto.rol === 'SUPERADMIN' && caller?.rol !== 'SUPERADMIN') {
      throw new ForbiddenException('Solo un Superadmin puede crear cuentas Superadmin');
    }
    const { password, ...res } = dto;
    try {
      const user = await this.prisma.user.create({
        data: {
          ...res,
          password: bcrypt.hashSync(password, 10),
          created_at: timezoneHelper(),
          updated_at: timezoneHelper(),
        },
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'User',
        entity_id: user.id,
        changes: { username: dto.username, rol: dto.rol, name: dto.name, lastname: dto.lastname },
        performed_by: caller?.username,
      });
      return await this.getUserById(user.id);
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  async findAll(dto: FilterUserDto): Promise<any> {
    const { search, rol, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (rol) where.rol = rol;
    if (search)
      where.OR = [
        { name:     { contains: search, mode: 'insensitive' } },
        { lastname: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { email:    { contains: search, mode: 'insensitive' } },
        { dni:      { contains: search, mode: 'insensitive' } },
      ];
    return await paginationHelper(
      this.prisma.user,
      {
        select: this.select,
        where,
        orderBy: { lastname: 'asc' },
      },
      pagination,
    );
  }

  async findOne(id: string): Promise<User> {
    return await this.getUserById(id);
  }

  async update(id: string, dto: UpdateUserDto, caller?: Caller): Promise<User> {
    const { password, ...res } = dto;
    const target = await this.getUserById(id);
    if (target.rol === 'SUPERADMIN' && caller?.rol !== 'SUPERADMIN') {
      throw new ForbiddenException('Solo un Superadmin puede modificar cuentas Superadmin');
    }
    if (dto.rol === 'SUPERADMIN' && caller?.rol !== 'SUPERADMIN') {
      throw new ForbiddenException('Solo un Superadmin puede asignar el rol Superadmin');
    }
    const data = password
      ? { password: bcrypt.hashSync(password, 10), updated_at: timezoneHelper(), ...res }
      : { updated_at: timezoneHelper(), ...res };

    const changes: Record<string, any> = {};
    for (const key of Object.keys(res) as (keyof typeof res)[]) {
      if (res[key] !== undefined && String(res[key]) !== String(target[key])) {
        changes[key] = { from: target[key], to: res[key] };
      }
    }
    if (password) changes['password'] = '(actualizada)';

    try {
      await this.prisma.user.update({ data, where: { id } });
    } catch (e) {
      this.handlePrismaError(e);
    }

    await this.audit.log({
      action: 'UPDATE',
      entity: 'User',
      entity_id: id,
      changes: { target_username: target.username, ...changes },
      performed_by: caller?.username,
    });

    return await this.getUserById(id);
  }

  async toggleDelete(id: string, caller?: Caller): Promise<any> {
    const user = await this.getUserById(id, true);
    if (user.rol === 'SUPERADMIN' && caller?.rol !== 'SUPERADMIN') {
      throw new ForbiddenException('Solo un Superadmin puede eliminar cuentas Superadmin');
    }
    const inactive = user.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.user.update({
      data: { updated_at: timezoneHelper(), deleted_at },
      where: { id },
    });

    const action = inactive ? 'RESTORE' : 'DELETE';
    await this.audit.log({
      action,
      entity: 'User',
      entity_id: id,
      changes: { target_username: user.username, target_rol: user.rol },
      performed_by: caller?.username,
    });

    return { action: inactive ? 'Restore' : 'Delete', id };
  }

  private handlePrismaError(e: any): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const fields = (e.meta?.target as string[]) ?? [];
      const fieldMap: Record<string, string> = {
        phone:    'El teléfono',
        email:    'El correo electrónico',
        username: 'El nombre de usuario',
        dni:      'El DNI',
      };
      const label = fields.map(f => fieldMap[f] ?? f).join(', ');
      throw new ConflictException(`${label} ya está registrado`);
    }
    throw e;
  }

  private async getUserById(id: string, toogle: boolean = false): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.select,
    });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    if (user.deleted_at && !toogle) throw new BadRequestException('Usuario eliminado');
    return user;
  }
}
