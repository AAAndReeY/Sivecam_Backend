import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Welcome to SIVECAM Backend';
  }

  async camarasCercanas(lat: number, lng: number, radio: number) {
    const [municipales, vecinales] = await Promise.all([
      this.prisma.municipal.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true, address: true, camera: true, latitude: true, longitude: true },
      }),
      this.prisma.communal.findMany({
        where: { deleted_at: null },
        select: { id: true, address: true, brand: true, mode: true, neighbor: true, latitude: true, longitude: true },
      }),
    ]);

    const resultado: any[] = [];

    for (const c of municipales) {
      const dist = haversineMetros(lat, lng, c.latitude, c.longitude);
      if (dist <= radio) {
        resultado.push({
          id: c.id,
          tipo: 'municipal',
          nombre: c.name,
          direccion: c.address,
          tipoCamara: c.camera,
          latitude: c.latitude,
          longitude: c.longitude,
          distanciaM: Math.round(dist),
        });
      }
    }

    for (const c of vecinales) {
      const dist = haversineMetros(lat, lng, c.latitude, c.longitude);
      if (dist <= radio) {
        resultado.push({
          id: c.id,
          tipo: 'vecinal',
          nombre: c.neighbor,
          direccion: c.address,
          marca: c.brand,
          modo: c.mode,
          latitude: c.latitude,
          longitude: c.longitude,
          distanciaM: Math.round(dist),
        });
      }
    }

    resultado.sort((a, b) => a.distanciaM - b.distanciaM);
    return resultado;
  }
}
