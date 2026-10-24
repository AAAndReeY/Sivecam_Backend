import { Module } from '@nestjs/common';
import { MunicipalService } from './municipal.service';
import { MunicipalController } from './municipal.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [MunicipalController],
  providers: [MunicipalService],
})
export class MunicipalModule {}
