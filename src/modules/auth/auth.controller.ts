import { Controller, Post, Body, Req, UseGuards, Sse, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';
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
