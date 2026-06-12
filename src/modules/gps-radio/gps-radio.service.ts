import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as https from 'https';

const DOLPHIN_BASE_URL = 'https://apigps.dolphin.pe';
const DOLPHIN_USERNAME = 'USRSJL2021';
const DOLPHIN_PASSWORD = 'usrsjl2026';

// Dolphin usa certificado con cadena no reconocida por Node
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function httpsRequest(url: string, options: https.RequestOptions, body?: string | Buffer): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, agent: insecureAgent }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

@Injectable()
export class GpsRadioService {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private cachedUnits: any[] | null = null;
  private unitsExpiresAt = 0;
  private readonly UNITS_TTL_MS = 15_000; // 15 segundos

  private async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const payload = JSON.stringify({ username: DOLPHIN_USERNAME, password: DOLPHIN_PASSWORD });
    const res = await httpsRequest(`${DOLPHIN_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, payload);

    if (res.status < 200 || res.status >= 300) {
      throw new InternalServerErrorException('Error al autenticar con API GPS Dolphin');
    }

    const data = JSON.parse(res.data) as { token?: string; access_token?: string };
    const token = data.token ?? data.access_token;
    if (!token) throw new InternalServerErrorException('Token no recibido de API GPS Dolphin');

    this.cachedToken = token;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return token;
  }

  async findCercanos(
    lat: number, lng: number, metros: number,
    fechaInicio?: string, fechaFin?: string,
    horaInicio?: string, horaFin?: string,
  ) {
    let all = await this.findAll();

    if (fechaInicio || fechaFin || horaInicio || horaFin) {
      all = all.filter((u) => {
        if (!u.fechaHora) return false;
        const fh = new Date(String(u.fechaHora).replace(' ', 'T'));
        if (isNaN(fh.getTime())) return false;

        if (fechaInicio) {
          if (fh < new Date(fechaInicio + 'T00:00:00')) return false;
        }
        if (fechaFin) {
          if (fh > new Date(fechaFin + 'T23:59:59')) return false;
        }
        if (horaInicio) {
          const [h, m] = horaInicio.split(':').map(Number);
          if (fh.getHours() * 60 + fh.getMinutes() < h * 60 + m) return false;
        }
        if (horaFin) {
          const [h, m] = horaFin.split(':').map(Number);
          if (fh.getHours() * 60 + fh.getMinutes() > h * 60 + m) return false;
        }
        return true;
      });
    }

    return all.filter((u) => {
      const R = 6371000;
      const dLat = ((u.latitud - lat) * Math.PI) / 180;
      const dLng = ((u.longitud - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) * Math.cos((u.latitud * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      const distancia = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      (u as any).distancia_metros = Math.round(distancia);
      return distancia <= metros;
    }).sort((a, b) => (a as any).distancia_metros - (b as any).distancia_metros);
  }

  async findHistorico(issi: string, fechaInicio: string, horaInicio: string, fechaFin: string, horaFin: string) {
    const token = await this.getToken();

    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const fields = {
      vidunidad: issi,
      vfinicia: `${fechaInicio} ${horaInicio}`,
      vftermina: `${fechaFin} ${horaFin}`,
    };
    const formBody = Object.entries(fields)
      .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`)
      .join('\r\n') + `\r\n--${boundary}--\r\n`;

    const res = await httpsRequest(`${DOLPHIN_BASE_URL}/buscar_historico`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formBody),
      },
    }, formBody);

    if (res.status < 200 || res.status >= 300) {
      this.cachedToken = null;
      throw new InternalServerErrorException('Error al obtener histórico GPS');
    }

    const raw = JSON.parse(res.data) as any[];
    return raw.map((u) => ({
      id: u._id,
      latitud: u._latitud,   // buscar_historico usa nombres correctos (sin swap)
      longitud: u._longitud,
      velocidad: u._vel,
      fechaHora: u._freg,
      color: u._color,
      estado: u._estdesc,
      tipo: u._tipounidad,
    })).filter((u) => u.latitud && u.longitud && Math.abs(u.latitud) < 90 && Math.abs(u.longitud) < 180);
  }

  async findKmDias(issi: string, fechaInicio: string, fechaFin: string) {
    const token = await this.getToken();

    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const fields = {
      vissi: issi,
      vdesde: `${fechaInicio} 00:00:00`,
      vhasta: `${fechaFin} 23:59:59`,
    };
    const formBody = Object.entries(fields)
      .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`)
      .join('\r\n') + `\r\n--${boundary}--\r\n`;

    const res = await httpsRequest(`${DOLPHIN_BASE_URL}/buscar_radios_km_dias`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formBody),
      },
    }, formBody);

    if (res.status < 200 || res.status >= 300) {
      this.cachedToken = null;
      throw new InternalServerErrorException('Error al obtener kilometraje GPS');
    }

    const raw = JSON.parse(res.data) as any[];
    return raw.map((u) => ({
      diaNombre: u.nomdia,
      fecha: u.fecha,
      kilometros: u.kilometros,
    }));
  }

  async findAll() {
    if (this.cachedUnits && Date.now() < this.unitsExpiresAt) {
      return this.cachedUnits;
    }

    const token = await this.getToken();

    // Construir form-data manualmente
    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const fields = { vidusuario: '265', vidtipo: '0', videstado: 'TODOS', vtipousuario: 'LOCALADMIN', vorden: '1', vissi: '' };
    const formBody = Object.entries(fields)
      .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`)
      .join('\r\n') + `\r\n--${boundary}--\r\n`;

    const res = await httpsRequest(`${DOLPHIN_BASE_URL}/gps_unidades`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formBody),
      },
    }, formBody);

    if (res.status < 200 || res.status >= 300) {
      this.cachedToken = null;
      throw new InternalServerErrorException('Error al obtener unidades GPS');
    }

    const raw = JSON.parse(res.data) as any[];

    const units = raw.map((u) => ({
      issi: u._issi,
      unicocodigo: u._unicocodigo,
      idUnidad: u._idtunidad,
      tipo: u._tipounid,
      estadoCod: u._estadocod,
      estado: u._estado,
      estadoRadar: u._estadoradar,
      color: u._color,
      hexacolor: u._hexacolor,
      latitud: u._longitud,   // Dolphin tiene los nombres invertidos: _longitud contiene la latitud (~-12)
      longitud: u._latitud,   // y _latitud contiene la longitud (~-77)
      fechaHora: u._fechahora,
      velocidad: u._velocidad,
      direccion: u._direccion,
    })).filter((u) => u.latitud && u.longitud && Math.abs(u.latitud) < 90 && Math.abs(u.longitud) < 180);

    this.cachedUnits = units;
    this.unitsExpiresAt = Date.now() + this.UNITS_TTL_MS;
    return units;
  }
}
