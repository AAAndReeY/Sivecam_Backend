import { PartialType } from '@nestjs/mapped-types';
import { CreateCampaignPointDto } from './create-campaign-point.dto';

export class UpdateCampaignPointDto extends PartialType(CreateCampaignPointDto) {}
