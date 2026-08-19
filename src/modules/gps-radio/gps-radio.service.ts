import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as https from 'https';

const DOLPHIN_BASE_URL = process.env.DOLPHIN_BASE_URL || 'https://apigps.dolphin.pe';
const DOLPHIN_USERNAME = process.env.DOLPHIN_USERNAME;
const DOLPHIN_PASSWORD = process.env.DOLPHIN_PASSWORD;

// Dolphin usa certificado con cadena no reconocida por Node
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function httpsRequest(url: string, options: https.RequestOptions, body?: string | Buffer, timeoutMs = 10000): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, agent: insecureAgent }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Dolphin API timeout after ${timeoutMs}ms: ${url}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

@Injectable()
export class GpsRadioService {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private cachedUnits: any[] | null = null;
  private cachedUnitsAll: any[] | null = null; // incluye radios sin GPS (para metadata)
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

    let data: any;
    try {
      data = JSON.parse(res.data);
    } catch (e) {
      console.error('Error parseando token Dolphin. Respuesta:', res.data);
      throw new InternalServerErrorException('La API Dolphin devolvió un formato inválido (posible error SQL interno).');
    }

    const token = data.token ?? data.access_token;
    if (!token) throw new InternalServerErrorException('Token no recibido de API GPS Dolphin');

    this.cachedToken = token;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return token;
  }

  private toDolphinDateTime(fecha: string, hora: string): string {
    const [yyyy, mm, dd] = fecha.split('-');
    return `${dd}/${mm}/${yyyy} ${hora}`;
  }

  private haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  async findCercanos(
    lat: number, lng: number, metros: number,
    fechaInicio?: string, fechaFin?: string,
    horaInicio?: string, horaFin?: string,
  ) {
    if (fechaInicio || fechaFin) {
      // Con fechas: solo Dolphin histórico, sin fallback que confunda resultados
      return this.findCercanosPorPunto(lat, lng, metros, fechaInicio!, fechaFin!, horaInicio, horaFin);
    }

    // Sin filtro de fecha: posición actual + haversine
    const all = await this.findAll();
    const resultado: any[] = [];
    for (const u of all) {
      const distancia = this.haversineMetros(lat, lng, u.latitud, u.longitud);
      if (distancia <= metros) resultado.push({ ...u, distancia_metros: distancia });
    }
    return resultado.sort((a, b) => a.distancia_metros - b.distancia_metros);
  }

  // Fallback cuando Dolphin no responde: muestra radios actualmente cercanos al punto.
  // No filtra por hora porque fechaHora es la posición *actual*, no histórica.
  private async findCercanosConFiltroFecha(
    lat: number, lng: number, metros: number,
  ) {
    const all = await this.findAll();
    return all.filter((u) => {
      const distancia = this.haversineMetros(lat, lng, u.latitud, u.longitud);
      if (distancia > metros) return false;
      (u as any).distancia_metros = distancia;
      return true;
    }).sort((a, b) => (a as any).distancia_metros - (b as any).distancia_metros);
  }

  private async findCercanosPorPunto(
    lat: number, lng: number, metros: number,
    fechaInicio: string, fechaFin: string,
    horaInicio?: string, horaFin?: string,
  ) {
    const token = await this.getToken();
    let desde = this.toDolphinDateTime(fechaInicio, horaInicio || '00:00');
    let hasta = this.toDolphinDateTime(fechaFin, horaFin || '23:59');
    // Si el rango está invertido, intercambiar
    if (new Date(desde.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')) >
        new Date(hasta.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'))) {
      [desde, hasta] = [hasta, desde];
    }

    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const fields: Record<string, string> = {
      vempresa: '35',
      vlatitud: String(lng),  // Dolphin tiene lat/lng invertidos
      vlongitud: String(lat),
      vdesde: desde,
      vhasta: hasta,
      vmetros: String(metros),
    };
    const formBody = Object.entries(fields)
      .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`)
      .join('\r\n') + `\r\n--${boundary}--\r\n`;

    console.log('[buscar_radios_por_punto] params:', { vlatitud: fields.vlatitud, vlongitud: fields.vlongitud, vdesde: fields.vdesde, vhasta: fields.vhasta, vmetros: fields.vmetros });

    const res = await httpsRequest(`${DOLPHIN_BASE_URL}/buscar_radios_por_punto`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formBody),
      },
    }, formBody, 60000);

    console.log('[buscar_radios_por_punto] status:', res.status, 'data length:', res.data.length);

    if (res.status < 200 || res.status >= 300) {
      this.cachedToken = null;
      throw new InternalServerErrorException('Error al buscar radios por punto en Dolphin');
    }

    const raw = JSON.parse(res.data) as any[];
    console.log('[buscar_radios_por_punto] radios encontrados por Dolphin:', raw.length, raw.map(r => r._radio));

    // Enriquecer con metadata de todos los radios (incluidos offline sin GPS)
    await this.findAll(); // asegura que cachedUnitsAll esté poblado
    const unitMap = new Map((this.cachedUnitsAll ?? []).map(u => [Number(u.issi), u]));

    return raw.map((r) => {
      const unit = unitMap.get(Number(r._radio));
      return {
        issi: r._radio,
        unicocodigo: r._codigo || unit?.unicocodigo || '',
        descripcion: r._descripcion || '',
        tipo: r._tipo || unit?.tipo || '',
        idUnidad: r._tipounidad ?? unit?.idUnidad,
        estado: unit?.estado || '',
        estadoRadar: unit?.estadoRadar || '',
        color: unit?.color || '',
        hexacolor: unit?.hexacolor || '',
        latitud: unit?.latitud ?? null,
        longitud: unit?.longitud ?? null,
        fechaHora: unit?.fechaHora || '',
        velocidad: unit?.velocidad ?? 0,
        direccion: unit?.direccion || '',
        distancia_metros: unit?.latitud != null
          ? this.haversineMetros(lat, lng, unit.latitud, unit.longitud)
          : null,
      };
    }).sort((a, b) => (a.distancia_metros ?? Infinity) - (b.distancia_metros ?? Infinity));
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
    console.log('[buscar_historico] total puntos raw:', raw.length, raw[0]);

    return raw.map((u) => ({
      id: u._id,
      latitud: u._latitud,
      longitud: u._longitud,
      velocidad: u._vel === 9999 ? 0 : u._vel,  // 9999 = sin dato de velocidad
      fechaHora: u._freg && u._hreg ? `${u._freg} ${u._hreg}` : (u._freg || ''),
      color: u._color,
      hexacolor: u._colorhexa,
      estado: u._estdesc,
      tipo: u._tipounidad,
    }))
    .filter((u) => {
      if (!u.latitud || !u.longitud) return false;
      if (u.latitud === 0 || u.longitud === 0) return false;
      // Limitar a coordenadas válidas de Perú
      if (u.latitud < -20 || u.latitud > 0) return false;
      if (u.longitud < -82 || u.longitud > -68) return false;
      return true;
    })
    .sort((a, b) => {
      // Ordenar cronológicamente combinando fecha + hora de _freg/_hreg
      const parse = (s: string) => {
        const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
        return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}`).getTime() : 0;
      };
      return parse(a.fechaHora) - parse(b.fechaHora);
    });
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

  async buscarIssi(issi: string) {
    const token = await this.getToken();
    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const formBody =
      `--${boundary}\r\nContent-Disposition: form-data; name="vIssi"\r\n\r\n${issi}\r\n--${boundary}--\r\n`;

    const res = await httpsRequest(`${DOLPHIN_BASE_URL}/buscar_issi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formBody),
      },
    }, formBody);

    if (res.status < 200 || res.status >= 300) {
      this.cachedToken = null;
      throw new InternalServerErrorException('Error al buscar radio en Dolphin');
    }

    const raw = JSON.parse(res.data);
    const u = Array.isArray(raw) ? raw[0] : raw;
    return {
      issi:       u._issi,
      empresa:    u._empresa,
      idtipunidad: u._idtipunidad,
      tipdesc:    u._tipdesc,
      tipabre:    u._tipabre,
      unicodigo:  u._unicodigo,
      unidesc:    u._unidesc,
      uniplaca:   u._uniplaca,
      unimodelo:  u._unimodelo,
      imei:       u._imei,
    };
  }

  async actualizarUnidad(issi: string, body: {
    idtipunidad: number;
    tipdesc: string;
    tipabre: string;
    unicodigo: string;
    unidesc: string;
    uniplaca: string;
    unimodelo: string;
    imei: string;
  }) {
    const token = await this.getToken();
    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const fields: Record<string, string> = {
      vidempresa:       '35',
      vIdUsuarioLocal:  '265',
      _issi:            String(issi),
      _idtipunidad:     String(body.idtipunidad),
      _tipdesc:         body.tipdesc,
      _tipabre:         body.tipabre,
      _unicodigo:       body.unicodigo  ?? '',
      _unidesc:         body.unidesc    ?? '',
      _uniplaca:        body.uniplaca   ?? '',
      _unimodelo:       body.unimodelo  ?? '',
      _imei:            body.imei       ?? '',
    };
    const formBody =
      Object.entries(fields)
        .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`)
        .join('\r\n') + `\r\n--${boundary}--\r\n`;

    const res = await httpsRequest(`${DOLPHIN_BASE_URL}/usuario_local_unidades`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formBody),
      },
    }, formBody);

    if (res.status < 200 || res.status >= 300) {
      this.cachedToken = null;
      throw new InternalServerErrorException('Error al actualizar radio en Dolphin');
    }

    this.cachedUnits = null; // invalidar cache
    return JSON.parse(res.data);
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

    const mapped = raw.map((u) => ({
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
    }));

    // Guardar todos (con y sin GPS) para poder obtener metadata de radios offline
    this.cachedUnitsAll = mapped;
    const units = mapped.filter((u) => u.latitud && u.longitud && Math.abs(u.latitud) < 90 && Math.abs(u.longitud) < 180);
    this.cachedUnits = units;
    this.unitsExpiresAt = Date.now() + this.UNITS_TTL_MS;
    return units;
  }
}
