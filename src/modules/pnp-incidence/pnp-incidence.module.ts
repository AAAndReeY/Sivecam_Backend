import { Module } from '@nestjs/common';
import { PnpIncidenceService } from './pnp-incidence.service';
import { PnpIncidenceController } from './pnp-incidence.controller';

@Module({
  controllers: [PnpIncidenceController],
  providers: [PnpIncidenceService],
})
export class PnpIncidenceModule {}
