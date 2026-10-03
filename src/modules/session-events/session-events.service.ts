import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { timezoneHelper } from '../../common/helpers';

export const SESSION_REPLACED = 'SESSION_REPLACED';
export const SESSION_REPLACED_MESSAGE = 'Se inició sesión con tu usuario en otro dispositivo';
export const SESSION_LIMIT_REDUCED = 'SESSION_LIMIT_REDUCED';
export const USER_DISABLED = 'USER_DISABLED';

// Mensajes que recibe el dispositivo cuyo token queda revocado
export const REVOKE_MESSAGES: Record<string, string> = {
  [SESSION_REPLACED]: SESSION_REPLACED_MESSAGE,
  [SESSION_LIMIT_REDUCED]: 'Se redujo el límite de sesiones de tu usuario',
  [USER_DISABLED]: 'Tu usuario fue desactivado',
};

type Channel = { user_id: string; subject: Subject<MessageEvent> };

// Canal en memoria para avisar al instante a los dispositivos conectados (SSE):
// sesiones revocadas y cambios de permisos.
// Nota: vive en el proceso; si el backend corre en varias instancias, cada una solo
// avisa a los dispositivos conectados a ella (el resto se entera en su siguiente petición).
@Injectable()
export class SessionEventsService {
  private channels = new Map<string, Channel>();

  constructor(private readonly prisma: PrismaService) {}

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

  // Deja como máximo `max` sesiones activas (las más recientes) y revoca el resto
  async enforceSessionLimit(user_id: string, max: number, reason: string) {
    const active = await this.prisma.userSession.findMany({
      where: { user_id, revoked_at: null },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    await this.revokeSessions(active.slice(Math.max(1, max)).map((s) => s.id), reason);
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

  async notifyRoleChanged(custom_role_id: string) {
    const users = await this.prisma.user.findMany({
      where: { custom_role_id },
      select: { id: true },
    });
    this.notifyPermsChanged(users.map((u) => u.id));
  }
}
