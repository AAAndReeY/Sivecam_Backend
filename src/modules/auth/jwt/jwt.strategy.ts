import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../interfaces';
import { REVOKE_MESSAGES } from '../../session-events';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
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
        user: {
          select: {
            username: true,
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
