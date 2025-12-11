import { Module } from '@nestjs/common';
import { SustenanceService } from './sustenance.service';
import { SustenanceController } from './sustenance.controller';

@Module({
  controllers: [SustenanceController],
  providers: [SustenanceService],
})
export class SustenanceModule {}
