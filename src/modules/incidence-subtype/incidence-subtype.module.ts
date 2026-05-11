import { Module } from '@nestjs/common';
import { IncidenceSubtypeService } from './incidence-subtype.service';
import { IncidenceSubtypeController } from './incidence-subtype.controller';

@Module({
  controllers: [IncidenceSubtypeController],
  providers: [IncidenceSubtypeService],
})
export class IncidenceSubtypeModule {}
