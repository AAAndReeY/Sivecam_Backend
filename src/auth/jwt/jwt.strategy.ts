import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
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
        rol: true,
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
      rol: user.rol,
    };
  }
}
