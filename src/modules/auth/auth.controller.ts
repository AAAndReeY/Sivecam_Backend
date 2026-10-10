import { Controller, Post, Body, Req, UseGuards, Sse, Query, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DeviceChallengeDto, LoginDto, RefreshTokenDto } from './dto';
import { JwtAuthGuard } from './guard';
import { SuccessMessage } from './decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @SuccessMessage('Login exitoso')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto, {
      user_agent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    });
  }

  // Reto que la app móvil firma con la llave del dispositivo antes del login o refresh
  @Post('device/challenge')
  @HttpCode(200)
  @SuccessMessage('Reto generado')
  deviceChallenge(@Body() dto: DeviceChallengeDto) {
    return this.authService.createChallenge(dto);
  }

  // Renueva el access token de una sesión móvil (refresh token + firma del dispositivo)
  @Post('refresh')
  @HttpCode(200)
  @SuccessMessage('Token renovado')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Sse('session-events')
  sessionEvents(@Query('token') token: string) {
    return this.authService.sessionEvents(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @SuccessMessage('Logout exitoso')
  logout(@Req() req: any) {
    return this.authService.logout(req.user);
  }
}
