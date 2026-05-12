import { Module } from '@nestjs/common';
import { IncidenceTypeService } from './incidence-type.service';
import { IncidenceTypeController } from './incidence-type.controller';

@Module({
  controllers: [IncidenceTypeController],
  providers: [IncidenceTypeService],
})
export class IncidenceTypeModule {}
