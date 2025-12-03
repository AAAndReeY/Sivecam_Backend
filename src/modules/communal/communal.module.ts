import { Module } from '@nestjs/common';
import { CommunalService } from './communal.service';
import { CommunalController } from './communal.controller';

@Module({
  providers: [CommunalService],
  controllers: [CommunalController],
})
export class CommunalModule {}
