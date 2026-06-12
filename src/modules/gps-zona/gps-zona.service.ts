import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { timezoneHelper } from '../../common/helpers';
import { CreateGpsZonaDto, UpdateGpsZonaDto } from './dto';

@Injectable()
export class GpsZonaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.gpsZone.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.gpsZone.findFirst({ where: { id, deleted_at: null } });
    if (!zone) throw new NotFoundException('Zona no encontrada');
    return zone;
  }

  async create(dto: CreateGpsZonaDto) {
    return this.prisma.gpsZone.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        geojson: dto.geojson,
        color: dto.color ?? '#6366f1',
        activo: dto.activo ?? true,
        radios_issi: dto.radios_issi ?? '[]',
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
  }

  async update(id: string, dto: UpdateGpsZonaDto) {
    await this.findOne(id);
    return this.prisma.gpsZone.update({
      where: { id },
      data: { ...dto, updated_at: timezoneHelper() },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.gpsZone.update({
      where: { id },
      data: { deleted_at: timezoneHelper() },
    });
  }
}
