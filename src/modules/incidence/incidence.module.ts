import { Module } from '@nestjs/common';
import { IncidenceService } from './incidence.service';
import { IncidenceController } from './incidence.controller';
import { SqlModule } from '../sql/sql.module';
import { TypologyModule } from '../typology/typology.module';

@Module({
  imports: [SqlModule, TypologyModule],
  controllers: [IncidenceController],
  providers: [IncidenceService],
})
export class IncidenceModule {}
