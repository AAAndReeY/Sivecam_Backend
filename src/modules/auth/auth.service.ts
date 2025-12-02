import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto';
import { JwtPayload } from './interfaces';
import { timezoneHelper } from '../../common/helpers';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async login(dto: LoginDto) {
    const { username, password } = dto;
    const user = await this.prisma.user.findUnique({
      where: { username, deleted_at: null },
      select: {
        id: true,
        username: true,
        password: true,
        rol: true,
      },
    });
    if (!user || !(await bcrypt.compare(password, user.password)))
      throw new UnauthorizedException('Credenciales inválidas');
    const { id } = user;
    const token = await this.getJwtToken({ sub: id });
    await this.prisma.user.update({
      data: {
        token,
        updated_at: timezoneHelper(),
      },
      where: { id },
    });
    return {
      user: username,
      rol: user.rol,
      token,
    };
  }

  async logout(user: any) {
    const { user_id: id } = user;
    await this.prisma.user.update({
      data: { token: null },
      where: { id },
    });
    return { success: true };
  }

  private getJwtToken(payload: JwtPayload) {
    return this.jwtService.signAsync(payload);
  }
}
