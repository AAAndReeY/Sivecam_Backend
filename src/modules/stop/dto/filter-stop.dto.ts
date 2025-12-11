import { IsOptional, IsString } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterStopDto extends SearchDto {
  @IsOptional()
  @IsString()
  authorized?: string;
}
