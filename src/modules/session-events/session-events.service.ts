import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { timezoneHelper } from '../../common/helpers';
import { checkSchedule } from '../auth/access-schedule';

export const SESSION_REPLACED = 'SESSION_REPLACED';
export const SESSION_REPLACED_MESSAGE = 'Se inició sesión con tu usuario en otro dispositivo';
export const SESSION_LIMIT_REDUCED = 'SESSION_LIMIT_REDUCED';
export const USER_DISABLED = 'USER_DISABLED';
export const DEVICE_RESET = 'DEVICE_RESET';
export const MOBILE_ONLY_ENABLED = 'MOBILE_ONLY_ENABLED';
export const REFRESH_REUSED = 'REFRESH_REUSED';
export const OUT_OF_SCHEDULE = 'OUT_OF_SCHEDULE';
export const ADMIN_LOGOUT = 'ADMIN_LOGOUT';

// Mensajes que recibe el dispositivo cuyo token queda revocado
export const REVOKE_MESSAGES: Record<string, string> = {
  [SESSION_REPLACED]: SESSION_REPLACED_MESSAGE,
  [SESSION_LIMIT_REDUCED]: 'Se redujo el límite de sesiones de tu usuario',
  [USER_DISABLED]: 'Tu usuario fue desactivado',
  [DEVICE_RESET]: 'El administrador restableció la vinculación de tu dispositivo',
  [MOBILE_ONLY_ENABLED]: 'Tu usuario ahora solo puede ingresar desde la app móvil autorizada',
  [REFRESH_REUSED]: 'Tu sesión se cerró por seguridad, vuelve a ingresar',
  [OUT_OF_SCHEDULE]: 'Tu horario de acceso terminó',
  [ADMIN_LOGOUT]: 'El administrador cerró tu sesión',
};

type Channel = { user_id: string; subject: Subject<MessageEvent> };

// Canal en memoria para avisar al instante a los dispositivos conectados (SSE):
// sesiones revocadas y cambios de permisos.
// Nota: vive en el proceso; si el backend corre en varias instancias, cada una solo
// avisa a los dispositivos conectados a ella (el resto se entera en su siguiente petición).
// Cada cuánto se revisa si los usuarios conectados siguen dentro de su horario de acceso
const SCHEDULE_SWEEP_MS = 30_000;

@Injectable()
export class SessionEventsService implements OnModuleInit, OnModuleDestroy {
  private channels = new Map<string, Channel>();
  private sweepTimer?: NodeJS.Timeout;
  private readonly logger = new Logger(SessionEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      this.sweepSchedules().catch((e) => this.logger.error(`Revisión de horarios: ${e?.message ?? e}`));
    }, SCHEDULE_SWEEP_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  // Cierra al instante (máx. 30 s de demora) las sesiones conectadas cuyo horario terminó.
  // Las que no están conectadas se cierran en su siguiente petición (JwtStrategy).
  async sweepSchedules() {
    const user_ids = [...new Set([...this.channels.values()].map((c) => c.user_id))];
    if (!user_ids.length) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: user_ids }, access_start: { not: null }, access_end: { not: null } },
      select: { id: true, access_start: true, access_end: true, access_days: true },
    });
    for (const user of users) {
      if (!checkSchedule(user).allowed) await this.revokeAllForUser(user.id, OUT_OF_SCHEDULE);
    }
  }

  subscribe(session_id: string, user_id: string): Observable<MessageEvent> {
    this.channels.get(session_id)?.subject.complete();
    const subject = new Subject<MessageEvent>();
    this.channels.set(session_id, { user_id, subject });
    // Ping periódico para que proxies/navegadores no corten la conexión ociosa
    const ping = interval(25_000).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));
    return new Observable<MessageEvent>((subscriber) => {
      const sub = merge(subject, ping).subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        if (this.channels.get(session_id)?.subject === subject) this.channels.delete(session_id);
      };
    });
  }

  // Revoca sesiones en BD y avisa a los dispositivos conectados
  async revokeSessions(session_ids: string[], reason: string) {
    if (!session_ids.length) return;
    await this.prisma.userSession.updateMany({
      where: { id: { in: session_ids }, revoked_at: null },
      data: { revoked_at: timezoneHelper(), revoked_reason: reason },
    });
    const data = { code: reason, message: REVOKE_MESSAGES[reason] ?? 'Sesión finalizada, vuelva a ingresar' };
    for (const id of session_ids) {
      const channel = this.channels.get(id);
      if (!channel) continue;
      channel.subject.next({ type: 'session-ended', data });
      channel.subject.complete();
      this.channels.delete(id);
    }
  }

  // Deja como máximo `max` sesiones activas (las más recientes) y revoca el resto.
  // `keep_id` (la sesión recién creada en el login) se conserva siempre: created_at tiene
  // precisión de segundos y dos logins en el mismo segundo no se pueden ordenar por fecha.
  async enforceSessionLimit(user_id: string, max: number, reason: string, keep_id?: string) {
    const active = await this.prisma.userSession.findMany({
      where: { user_id, revoked_at: null, ...(keep_id && { NOT: { id: keep_id } }) },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    const allowed = Math.max(1, max) - (keep_id ? 1 : 0);
    await this.revokeSessions(active.slice(allowed).map((s) => s.id), reason);
  }

  async revokeAllForUser(user_id: string, reason: string) {
    const active = await this.prisma.userSession.findMany({
      where: { user_id, revoked_at: null },
      select: { id: true },
    });
    await this.revokeSessions(active.map((s) => s.id), reason);
  }

  // Avisa a los usuarios conectados que sus permisos cambiaron (recargan sin F5)
  notifyPermsChanged(user_ids?: string[]) {
    const targets = user_ids ? new Set(user_ids) : null;
    for (const { user_id, subject } of this.channels.values()) {
      if (!targets || targets.has(user_id)) subject.next({ type: 'perms-changed', data: {} });
    }
  }

  // Una cámara municipal se ocultó/mostró en el mapa: todos los conectados quitan o
  // vuelven a dibujar su pin sin recargar (solo viaja el id, sin motivo)
  notifyMapVisibility(id: string, map_hidden: boolean) {
    for (const { subject } of this.channels.values()) {
      subject.next({ type: 'map-visibility', data: { id, map_hidden } });
    }
  }

  async notifyRoleChanged(custom_role_id: string) {
    const users = await this.prisma.user.findMany({
      where: { custom_role_id },
      select: { id: true },
    });
    this.notifyPermsChanged(users.map((u) => u.id));
  }
}
