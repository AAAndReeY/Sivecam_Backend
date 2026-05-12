import { Module } from '@nestjs/common';
import { PnpIncidenceService } from './pnp-incidence.service';
import { PnpIncidenceController } from './pnp-incidence.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PnpIncidenceController],
  providers: [PnpIncidenceService],
})
export class PnpIncidenceModule {}
