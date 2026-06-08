import { Module } from '@nestjs/common';
import { CampaignPointController } from './campaign-point.controller';
import { CampaignPointService } from './campaign-point.service';

@Module({
  controllers: [CampaignPointController],
  providers: [CampaignPointService],
})
export class CampaignPointModule {}
