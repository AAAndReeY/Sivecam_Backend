import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GpsRadioService } from './gps-radio.service';
import { GpsRadioController } from './gps-radio.controller';

@Module({
  imports: [AuditModule],
  controllers: [GpsRadioController],
  providers: [GpsRadioService],
  exports: [GpsRadioService],
})
export class GpsRadioModule {}
