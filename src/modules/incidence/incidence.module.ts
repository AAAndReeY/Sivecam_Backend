import { Module } from '@nestjs/common';
import { IncidenceService } from './incidence.service';
import { IncidenceController } from './incidence.controller';
import { SqlModule } from '../sql/sql.module';

@Module({
  imports: [SqlModule],
  controllers: [IncidenceController],
  providers: [IncidenceService],
})
export class IncidenceModule {}