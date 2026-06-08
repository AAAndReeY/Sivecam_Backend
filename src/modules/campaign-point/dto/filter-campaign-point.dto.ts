import { IsOptional, IsString } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterCampaignPointDto extends SearchDto {
  @IsOptional()
  @IsString()
  category?: string;
}
