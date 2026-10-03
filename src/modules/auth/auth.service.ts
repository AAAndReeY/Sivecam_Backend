import { Injectable, MessageEvent, UnauthorizedException } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto';
import { JwtPayload } from './interfaces';
import { timezoneHelper } from '../../common/helpers';
import { REVOKE_MESSAGES, SESSION_REPLACED, SessionEventsService } from '../session-events';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private sessionChannel: SessionEventsService,
  ) {}

  async login(dto: LoginDto, meta: { user_agent?: string; ip?: string } = {}) {
    const { username, password } = dto;
    const user = await this.prisma.user.findUnique({
      where: { username, deleted_at: null },
      select: {
        id: true,
        username: true,
        password: true,
        max_sessions: true,
        custom_role_id: true,
        custom_role: { select: { name: true, system_slug: true } },
      },
    });
    if (!user || !(await bcrypt.compare(password, user.password)))
      throw new UnauthorizedException('Credenciales inválidas');
    const { id } = user;
    const session = await this.prisma.userSession.create({
      data: {
        user_id: id,
        user_agent: meta.user_agent?.slice(0, 255) ?? null,
        ip: meta.ip ?? null,
        created_at: timezoneHelper(),
      },
    });
    const token = await this.getJwtToken({ sub: id, sid: session.id });
    await this.prisma.user.update({
      data: { token, updated_at: timezoneHelper() },
      where: { id },
    });
    await this.sessionChannel.enforceSessionLimit(id, user.max_sessions, SESSION_REPLACED);
    await this.cleanupRevokedSessions(id);
    return {
      user:             username,
      rol:              user.custom_role?.system_slug ?? null,
      custom_role_id:   user.custom_role_id,
      custom_role_name: user.custom_role?.name ?? null,
      token,
    };
  }

  async logout(user: any) {
    const { session_id } = user;
    await this.prisma.userSession.deleteMany({ where: { id: session_id } });
    return { success: true };
  }

  // Canal SSE: el front lo mantiene abierto y recibe 'session-ended' en cuanto otro
  // inicio de sesión revoca esta sesión. EventSource no permite headers, el token va por query.
  async sessionEvents(token: string): Promise<Observable<MessageEvent>> {
    const ended = (code: string, message: string) =>
      of<MessageEvent>({ type: 'session-ended', data: { code, message } });
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token ?? '');
    } catch {
      return ended('SESSION_ENDED', 'Sesión finalizada, vuelva a ingresar');
    }
    const session = payload.sid
      ? await this.prisma.userSession.findUnique({
          where: { id: payload.sid },
          select: { user_id: true, revoked_at: true, revoked_reason: true },
        })
      : null;
    if (!session || session.user_id !== payload.sub)
      return ended('SESSION_ENDED', 'Sesión finalizada, vuelva a ingresar');
    if (session.revoked_at) {
      const reason = session.revoked_reason ?? 'SESSION_ENDED';
      return ended(reason, REVOKE_MESSAGES[reason] ?? 'Sesión finalizada, vuelva a ingresar');
    }
    return this.sessionChannel.subscribe(payload.sid, payload.sub);
  }

  // Sesiones revocadas hace más de 7 días ya no sirven para avisar
  private async cleanupRevokedSessions(user_id: string) {
    const limit = timezoneHelper();
    limit.setUTCDate(limit.getUTCDate() - 7);
    await this.prisma.userSession.deleteMany({
      where: { user_id, revoked_at: { lt: limit } },
    });
  }

  private getJwtToken(payload: JwtPayload) {
    return this.jwtService.signAsync(payload);
  }
}
