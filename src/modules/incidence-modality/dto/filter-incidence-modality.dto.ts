import { IsOptional, IsUUID } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterIncidenceModalityDto extends SearchDto {
  @IsOptional()
  @IsUUID()
  subtype_id?: string;
}
