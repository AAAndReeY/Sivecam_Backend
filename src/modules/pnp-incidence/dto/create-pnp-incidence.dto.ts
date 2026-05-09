import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CaseStatus, Shift } from '@prisma/client';

export class CreatePnpIncidenceDto {
  @IsString()
  description: string;

  @IsString()
  incidence_type: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  jurisdiction: string;

  @IsOptional()
  @Transform(({ value }) => value ?? null)
  @IsEnum(Shift)
  shift?: Shift | null;

  @IsString()
  police_station: string;

  @IsOptional()
  @IsString()
  complaint_number?: string;

  @IsOptional()
  @Transform(({ value }) => value ?? null)
  @IsEnum(CaseStatus)
  case_status?: CaseStatus | null;

  @IsDateString()
  occurred_at: string;
}
