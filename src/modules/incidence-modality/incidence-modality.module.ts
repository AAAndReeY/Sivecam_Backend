import { Module } from '@nestjs/common';
import { IncidenceModalityService } from './incidence-modality.service';
import { IncidenceModalityController } from './incidence-modality.controller';

@Module({
  controllers: [IncidenceModalityController],
  providers: [IncidenceModalityService],
})
export class IncidenceModalityModule {}
