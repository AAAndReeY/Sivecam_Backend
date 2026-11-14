import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LatLng, haversineM } from './geo.util';

// Distancia máxima para sugerir una cámara al despachar.
export const RADIO_CAMARAS_M = 300;
// Alcance por defecto del campo de visión (mismo valor que dibuja el mapa: 0.002° ≈ 220 m).
const ALCANCE_DEFECTO_GRADOS = 0.002;
const ARCO: Record<string, number> = { C360: 360, C180: 180, LPR: 35 };

/**
 * ¿El punto cae dentro del campo de visión? Misma geometría que `createSectorPolygon` del mapa:
 * ángulo en grados con 0° = Este (eje X = longitud, eje Y = latitud) y radio en grados.
 */
export function veElPunto(
  cam: { latitude: number; longitude: number; camera: string; angle: number | null; radius: number | null },
  p: LatLng,
): boolean {
  const dx = p.lng - cam.longitude;
  const dy = p.lat - cam.latitude;
  if (Math.hypot(dx, dy) > (cam.radius ?? ALCANCE_DEFECTO_GRADOS)) return false;
  const arco = ARCO[cam.camera] ?? 0;
  if (arco >= 360) return true;
  if (cam.angle == null) return false;
  const rumbo = (Math.atan2(dy, dx) * 180) / Math.PI;
  const diff = Math.abs(((rumbo - cam.angle + 540) % 360) - 180);
  return diff <= arco / 2;
}

@Injectable()
export class CamarasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Qué cámaras puede ver el usuario según las capas de su rol (SUPERADMIN: todas). */
  private async capas(user: { system_slug?: string | null; custom_role_id?: string | null }) {
    if (user?.system_slug === 'SUPERADMIN') return { municipales: true, vecinales: true };
    if (!user?.custom_role_id) return { municipales: false, vecinales: false };
    const perms = await this.prisma.roleLayerPermission.findMany({
      where: { custom_role_id: user.custom_role_id, layer_key: { in: ['camaras', 'camarasVecinales'] } },
      select: { layer_key: true },
    });
    const k = new Set(perms.map((x) => x.layer_key));
    return { municipales: k.has('camaras'), vecinales: k.has('camarasVecinales') };
  }

  /**
   * Cámaras cerca de la emergencia, primero las que la ven (campo de visión) y luego por distancia.
   * Vecinales: solo dirección, marca y modo (sin datos del vecino ni credenciales).
   */
  async cerca(p: LatLng, user: any, radioM = RADIO_CAMARAS_M) {
    const capas = await this.capas(user);
    const [municipales, vecinales] = await Promise.all([
      capas.municipales
        ? this.prisma.municipal.findMany({
            where: { deleted_at: null, map_hidden: false },
            select: { id: true, name: true, address: true, camera: true, latitude: true, longitude: true, angle: true, radius: true, megaphone: true, buttom: true },
          })
        : [],
      capas.vecinales
        ? this.prisma.communal.findMany({
            where: { deleted_at: null },
            select: { id: true, address: true, brand: true, mode: true, latitude: true, longitude: true },
          })
        : [],
    ]);
    const out: any[] = [];
    for (const c of municipales) {
      const d = haversineM(p, { lat: c.latitude, lng: c.longitude });
      if (d > radioM) continue;
      out.push({
        id: c.id,
        tipo: 'MUNICIPAL',
        codigo: c.name,
        direccion: c.address,
        modelo: c.camera,
        lat: c.latitude,
        lng: c.longitude,
        distancia_m: Math.round(d),
        ve_el_punto: veElPunto(c, p),
        megafono: c.megaphone,
        boton_panico: c.buttom,
      });
    }
    for (const c of vecinales) {
      const d = haversineM(p, { lat: c.latitude, lng: c.longitude });
      if (d > radioM) continue;
      out.push({
        id: c.id,
        tipo: 'VECINAL',
        codigo: `Vecinal ${c.brand}`,
        direccion: c.address,
        modelo: c.mode,
        lat: c.latitude,
        lng: c.longitude,
        distancia_m: Math.round(d),
        ve_el_punto: null, // sin dato de orientación
      });
    }
    return {
      radio_m: radioM,
      sin_permiso: !capas.municipales && !capas.vecinales,
      rows: out
        .sort((a, b) => Number(b.ve_el_punto === true) - Number(a.ve_el_punto === true) || a.distancia_m - b.distancia_m)
        .slice(0, 8),
    };
  }
}
