import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { CaseStatus, Shift } from '@prisma/client';

export class CreatePnpIncidenceDto {
  @IsString()
  description: string;

  @IsString()
  incidence_type: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  jurisdiction: string;

  @IsEnum(Shift)
  shift: Shift;

  @IsString()
  police_station: string;

  @IsOptional()
  @IsString()
  complaint_number?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  case_status?: CaseStatus;

  @IsDateString()
  occurred_at: string;
}
