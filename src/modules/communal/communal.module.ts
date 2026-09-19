import { Module } from '@nestjs/common';
import { CommunalService } from './communal.service';
import { CommunalController } from './communal.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [CommunalService],
  controllers: [CommunalController],
})
export class CommunalModule {}
