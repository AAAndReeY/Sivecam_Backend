import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as http from 'http';

const BODYCAM_BASE_URL = 'http://gps-bodycam.munisjl.gob.pe:8087';
const BODYCAM_TOKEN    = 'cecom2026';

function httpGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

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

  async bodycamsCercanas(lat: number, lng: number, radio: number) {
    const raw  = await httpGet(`${BODYCAM_BASE_URL}/api/bodycams`, { Authorization: `Bearer ${BODYCAM_TOKEN}` });
    const data = JSON.parse(raw);
    const all: any[] = Array.isArray(data) ? data : (data?.data ?? []);

    return all
      .filter((bc) => bc.activa && bc.latitud != null && bc.longitud != null)
      .map((bc) => ({ ...bc, distanciaM: Math.round(haversineMetros(lat, lng, Number(bc.latitud), Number(bc.longitud))) }))
      .filter((bc) => bc.distanciaM <= radio)
      .sort((a, b) => a.distanciaM - b.distanciaM);
  }
}
