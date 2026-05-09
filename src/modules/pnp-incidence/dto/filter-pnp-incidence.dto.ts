import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CaseStatus, Shift } from '@prisma/client';
import { PaginationDto } from '../../../common/dto';

export class FilterPnpIncidenceDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  incidence_type?: string;

  @IsOptional()
  @IsEnum(Shift)
  shift?: Shift;

  @IsOptional()
  @IsString()
  police_station?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  case_status?: CaseStatus;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;

  @IsOptional()
  @IsString()
  no_shift?: string;
}
