import { IsOptional, IsUUID } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterUserDto extends SearchDto {
  @IsOptional()
  @IsUUID()
  custom_role_id?: string;
}
