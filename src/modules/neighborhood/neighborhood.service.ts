import { BadRequestException, Injectable } from '@nestjs/common';
import { Rol, Neighborhood } from '@prisma/client';
import { CreateNeighborhoodDto, UpdateNeighborhoodDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationHelper, timezoneHelper } from '../../common/helpers';
import { SearchDto } from '../../common/dto';

@Injectable()
export class NeighborhoodService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNeighborhoodDto): Promise<Neighborhood> {
    const neighborhood = await this.prisma.neighborhood.create({
      data: dto
    });
    return await this.getNeighborhoodById(neighborhood.id);
  }

  async findAll(dto: SearchDto): Promise<any> {
    const { search, ...pagination } = dto;
    const where: any = { deleted_at: null };
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { lastname: { contains: search, mode: 'insensitive' } },
        { dni: { contains: search, mode: 'insensitive' } },
      ];
    return await paginationHelper(
      this.prisma.neighborhood,
      {
        select: {
          id: true,
          address: true,
          camera_model: true,
          camera_type: true,
          comment: true,
          establishment: true,
          jurisdiction: { select: { name: true }},
          latitude: true,
          longitude: true,
          neighbor_name: true,
          deleted_at: true,
        },
        where,
        orderBy: { lastname: 'asc' },
      },
      pagination,
    );
  }

  async findOne(id: string, rol?: Rol): Promise<Neighborhood> {
    return await this.getNeighborhoodById(id, rol);
  }

  async update(id: string, dto: UpdateNeighborhoodDto): Promise<Neighborhood> {
    await this.getNeighborhoodById(id);
    await this.prisma.neighborhood.update({
      data: dto,
      where: { id },
    });
    return await this.getNeighborhoodById(id);
  }

  async delete(id: string): Promise<any> {
    await this.getNeighborhoodById(id);
    await this.prisma.neighborhood.update({
      data: {
        updated_at: timezoneHelper(),
        deleted_at: timezoneHelper(),
      },
      where: { id },
    });
  }

  private async getNeighborhoodById(id: string, rol: Rol | null = null): Promise<any> {
    const select = {
      address: true,
      camera_model: true,
      camera_password: false,
      camera_type: true,
      camera_username: false,
      comment: true,
      establishment: true,
      interconnector: false,
      jurisdiction: { select: { name: true }},
      latitude: true,
      longitude: true,
      neighbor_name: true,
      neighbor_phone: false,
      serial: false,
      deleted_at: true,
    };
    if (rol === Rol.administrator || rol === Rol.supervisor) {
      select.camera_password = true;
      select.camera_username = true;
      select.interconnector = true;
      select.neighbor_phone = true;
      select.serial = true;
    }
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id },
      select,
    });
    if (!neighborhood) throw new BadRequestException('Cámara vecinal no encontrada');
    if (neighborhood.deleted_at) throw new BadRequestException('Cámara vecinal eliminada');
    return neighborhood;
  }
}
