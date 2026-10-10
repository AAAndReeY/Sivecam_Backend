import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';

const CODIGO_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function httpGet(url: string, headers: Record<string, string>, timeoutMs = 20000): Promise<{ status: number; data: string }> {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    // agent: false evita el agente global de Node (timeout de 5 s en keep-alive),
    // que cortaba antes de timeoutMs cuando la API externa tarda en responder
    const req = client.get(url, { headers, agent: false }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`API bodycams timeout after ${timeoutMs}ms`));
    });
  });
}

/**
 * Proxy hacia la API externa de bodycams. El token de esa API vive solo en el
 * servidor (BODYCAM_API_TOKEN): el frontend consulta este backend con su JWT.
 */
@Injectable()
export class BodycamService {
  private cachedList: any[] | null = null;
  private listExpiresAt = 0;
  private pendingList: Promise<any[]> | null = null;
  private readonly LIST_TTL_MS = 10_000; // el mapa refresca cada 15 s

  constructor(private readonly config: ConfigService) {}

  private async request(path: string): Promise<any> {
    const baseUrl = this.config.get<string>('BODYCAM_API_URL');
    const token = this.config.get<string>('BODYCAM_API_TOKEN');
    if (!baseUrl || !token)
      throw new ServiceUnavailableException('API de bodycams no configurada (BODYCAM_API_URL / BODYCAM_API_TOKEN)');

    let res: { status: number; data: string };
    try {
      res = await httpGet(`${baseUrl.replace(/\/+$/, '')}${path}`, { Authorization: `Bearer ${token}` });
    } catch (e) {
      console.error('Error consultando API de bodycams:', (e as Error).message);
      throw new BadGatewayException('No se pudo conectar con la API de bodycams');
    }
    if (res.status < 200 || res.status >= 300) {
      console.error(`API de bodycams respondió ${res.status} en ${path}`);
      throw new BadGatewayException('La API de bodycams respondió con error');
    }
    try {
      return JSON.parse(res.data);
    } catch {
      throw new BadGatewayException('La API de bodycams devolvió un formato inválido');
    }
  }

  async findAll(): Promise<any[]> {
    if (this.cachedList && Date.now() < this.listExpiresAt) return this.cachedList;
    // Varias peticiones simultáneas comparten una sola consulta a la API externa
    if (!this.pendingList) {
      this.pendingList = this.request('/api/bodycams')
        .then((data) => {
          const list: any[] = Array.isArray(data) ? data : (data?.data ?? []);
          this.cachedList = list;
          this.listExpiresAt = Date.now() + this.LIST_TTL_MS;
          return list;
        })
        .catch((err) => {
          // La API externa a veces tarda o falla: se sirve la última lista conocida
          if (this.cachedList) return this.cachedList;
          throw err;
        })
        .finally(() => { this.pendingList = null; });
    }
    return this.pendingList;
  }

  async findUbicaciones(codigo: string, desde?: string, hasta?: string, limite?: string) {
    if (!CODIGO_REGEX.test(codigo ?? '')) throw new BadRequestException('Código de bodycam inválido');
    const lim = Math.min(Math.max(parseInt(limite ?? '', 10) || 10000, 1), 10000);
    const params = new URLSearchParams({ limite: String(lim) });
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    return this.request(`/api/ubicaciones/${encodeURIComponent(codigo)}?${params.toString()}`);
  }

  async findCercanas(lat: number, lng: number, radio: number) {
    const all = await this.findAll();
    return all
      .filter((bc) => bc.activa && bc.latitud != null && bc.longitud != null)
      .map((bc) => ({ ...bc, distanciaM: Math.round(haversineMetros(lat, lng, Number(bc.latitud), Number(bc.longitud))) }))
      .filter((bc) => bc.distanciaM <= radio)
      .sort((a, b) => a.distanciaM - b.distanciaM);
  }
}
