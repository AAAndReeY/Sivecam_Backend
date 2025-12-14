import { BadRequestException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto, FilterUserDto, UpdateUserDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';

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

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<User> {
    const { password, ...res } = dto;
    const user = await this.prisma.user.create({
      data: {
        ...res,
        password: bcrypt.hashSync(password, 10),
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    return await this.getUserById(user.id);
  }

  async findAll(dto: FilterUserDto): Promise<any> {
    const { search, rol, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (rol) where.rol = rol;
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { lastname: { contains: search, mode: 'insensitive' } },
        { dni: { contains: search, mode: 'insensitive' } },
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

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const { password, ...res } = dto;
    await this.getUserById(id);
    const data = password
      ? {
          password: bcrypt.hashSync(password, 10),
          updated_at: timezoneHelper(),
          ...res,
        }
      : { updated_at: timezoneHelper(), ...res };
    await this.prisma.user.update({
      data,
      where: { id },
    });
    return await this.getUserById(id);
  }

  async toggleDelete(id: string): Promise<any> {
    const user = await this.getUserById(id, true);
    const inactive = user.deleted_at;
    const deleted_at = inactive ? null : timezoneHelper();
    await this.prisma.user.update({
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

  private async getUserById(id: string, toogle: boolean = false): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.select,
    });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    if (user.deleted_at && !toogle)
      throw new BadRequestException('Usuario eliminado');
    return user;
  }
}
