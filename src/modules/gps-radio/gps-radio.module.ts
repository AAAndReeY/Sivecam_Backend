import { Module } from '@nestjs/common';
import { GpsRadioService } from './gps-radio.service';
import { GpsRadioController } from './gps-radio.controller';

@Module({
  controllers: [GpsRadioController],
  providers: [GpsRadioService],
  exports: [GpsRadioService],
})
export class GpsRadioModule {}
