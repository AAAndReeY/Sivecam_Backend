import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * Protege endpoints de integración (sistemas externos) con la cabecera `x-api-key`.
 * Las llaves válidas van en INTEGRATION_API_KEYS, separadas por comas (una por sistema).
 * Sin llaves configuradas, el endpoint queda cerrado.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-api-key'];
    const keys = (this.config.get<string>('INTEGRATION_API_KEYS') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    // Se comparan los hash para que la comparación no dependa del largo de la llave
    const valid =
      typeof provided === 'string' &&
      keys.some((key) => timingSafeEqual(sha256(provided), sha256(key)));
    if (!valid) throw new UnauthorizedException('API key inválida o ausente');
    return true;
  }
}
