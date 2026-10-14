import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../interfaces';
import { OUT_OF_SCHEDULE, REVOKE_MESSAGES, SessionEventsService } from '../../session-events';
import { checkSchedule, outOfScheduleMessage } from '../access-schedule';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private sessionEvents: SessionEventsService,
  ) {
    super({
      secretOrKey: config.get<string>('JWT_SECRET') as string,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    const { sub, sid } = payload;
    // Tokens emitidos antes del control de sesiones no traen sid
    if (!sid)
      throw new UnauthorizedException('Sesión finalizada, vuelva a ingresar');
    const session = await this.prisma.userSession.findUnique({
      select: {
        user_id: true,
        revoked_at: true,
        revoked_reason: true,
        is_mobile: true,
        user: {
          select: {
            username: true,
            mobile_only: true,
            access_start: true,
            access_end: true,
            access_days: true,
            custom_role_id: true,
            custom_role: {
              select: {
                system_slug: true,
                allowed_jurisdictions: true,
              },
            },
          },
        },
      },
      where: { id: sid },
    });
    if (!session || session.user_id !== sub)
      throw new UnauthorizedException('Sesión finalizada, vuelva a ingresar');
    if (session.revoked_at) {
      const reason = session.revoked_reason;
      if (reason && REVOKE_MESSAGES[reason])
        throw new UnauthorizedException({
          statusCode: 401,
          code: reason,
          message: REVOKE_MESSAGES[reason],
        });
      throw new UnauthorizedException('Sesión finalizada, vuelva a ingresar');
    }
    const { user } = session;
    // Usuario "solo app móvil": una sesión que no se abrió con firma del dispositivo no vale
    if (user.mobile_only && !session.is_mobile)
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'MOBILE_ONLY',
        message: 'Este usuario solo puede ingresar desde la app móvil autorizada',
      });
    // Fuera de su horario de acceso: la sesión se cierra (al día siguiente vuelve a ingresar)
    if (!checkSchedule(user).allowed) {
      await this.sessionEvents.revokeSessions([sid], OUT_OF_SCHEDULE);
      throw new UnauthorizedException({
        statusCode: 401,
        code: OUT_OF_SCHEDULE,
        message: outOfScheduleMessage(user),
      });
    }
    return {
      user_id: sub,
      session_id: sid,
      username: user.username,
      system_slug: user.custom_role?.system_slug ?? null,
      custom_role_id: user.custom_role_id,
      allowed_jurisdictions: user.custom_role?.allowed_jurisdictions ?? [],
    };
  }
}
