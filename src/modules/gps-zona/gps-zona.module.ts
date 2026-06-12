import { Module } from '@nestjs/common';
import { GpsZonaService } from './gps-zona.service';
import { GpsZonaController } from './gps-zona.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GpsZonaController],
  providers: [GpsZonaService],
})
export class GpsZonaModule {}
