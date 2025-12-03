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
  app.enableCors({
    origin: '*',
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
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.verbose(`Server running on port ${port}`);
}
bootstrap();
