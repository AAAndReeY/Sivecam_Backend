import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterIncidenceDto {
  @IsDateString()
  start: string;

  @IsDateString()
  end: string;

  @Type(() => Number)
  @IsNumber()
  type: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  jurisdiction?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  schedule?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  shift?: number;
}
