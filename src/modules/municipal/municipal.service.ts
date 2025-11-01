import { BadRequestException, Injectable } from '@nestjs/common';
import { Rol, Municipal } from '@prisma/client';
import { CreateMunicipalDto, UpdateMunicipalDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { SearchDto } from '../../common/dto';

@Injectable()
export class MunicipalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMunicipalDto): Promise<Municipal> {
    const municipal = await this.prisma.municipal.create({
      data: dto,
    });
    return await this.getMunicipalById(municipal.id);
  }

  async findAll(dto: SearchDto): Promise<any> {
    const { search, ...pagination } = dto;
    const where: any = {  deleted_at: null };
    if (search)
      where.OR = [
        { pole: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { camera: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } },
      ];
    return await paginationHelper(
      this.prisma.municipal,
      {
        select: {
          id: true,
          pole: true,
          address: true,
          camera: true,
          implementation: true,
          latitude: true,
          longitude: true,
          type: true,
        },
        where,
        orderBy: { lastname: 'pole' },
      },
      pagination,
    );
  }

  async findOne(id: string, rol?: Rol): Promise<Municipal> {
    return await this.getMunicipalById(id, rol);
  }

  async update(id: string, dto: UpdateMunicipalDto): Promise<Municipal> {
    await this.getMunicipalById(id);
    await this.prisma.municipal.update({
      data: dto,
      where: { id },
    });
    return await this.getMunicipalById(id);
  }

  async delete(id: string): Promise<any> {
    await this.getMunicipalById(id);
    await this.prisma.municipal.update({
      data: {
        updated_at: timezoneHelper(),
        deleted_at: timezoneHelper(),
      },
      where: { id },
    });
  }

  private async getMunicipalById(id: string, rol: string | null = null): Promise<any> {
    const select = {
      address: true,
      camera: true,
      implementation: true,
      ip: false,
      latitude: true,
      longitude: true,
      pole: true,
      type: true,
      deleted_at: true,
    };
    if (rol === Rol.administrator || rol === Rol.supervisor)
      select.ip = true;
    const municipal = await this.prisma.municipal.findUnique({
      where: { id },
      select,
    });
    if (!municipal) throw new BadRequestException('Cámara municipal no encontrada');
    if (municipal.deleted_at) throw new BadRequestException('Cámara municipal eliminada');
    return municipal;
  }
}
