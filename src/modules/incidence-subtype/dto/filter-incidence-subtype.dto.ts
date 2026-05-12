import { IsOptional, IsString, IsUUID } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterIncidenceSubtypeDto extends SearchDto {
  @IsOptional()
  @IsUUID()
  type_id?: string;
}
