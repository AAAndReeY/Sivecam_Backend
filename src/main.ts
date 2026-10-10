import { NestFactory, Reflector } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import {
  PrismaExceptionInterceptor,
  ResponseInterceptor,
} from './common/interceptors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'log', 'verbose', 'warn'],
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  // Orígenes permitidos separados por comas (ej. https://mapa.munisjl.gob.pe).
  // Sin configurar se mantiene abierto para no romper despliegues existentes.
  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!corsOrigins.length)
    logger.warn('CORS_ORIGINS no configurado: CORS abierto a cualquier origen');
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new PrismaExceptionInterceptor(),
    new ResponseInterceptor(reflector),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  app.setGlobalPrefix('api');
  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  logger.verbose(`Server running on port ${port}`);
}
bootstrap();
