import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FilterCustomRoleDto extends PaginationDto {
  @IsString()
  @IsOptional()
  search?: string;
}
