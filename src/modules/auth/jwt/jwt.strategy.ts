import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../interfaces';

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
    const { sub } = payload;
    const user = await this.prisma.user.findFirst({
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
      where: {
        id: sub,
        token: { not: null },
      },
    });
    if (!user)
      throw new UnauthorizedException('Sesión finalizada, vuelva a ingresar');
    return {
      user_id: sub,
      username: user.username,
      system_slug: user.custom_role?.system_slug ?? null,
      custom_role_id: user.custom_role_id,
      allowed_jurisdictions: user.custom_role?.allowed_jurisdictions ?? [],
    };
  }
}
