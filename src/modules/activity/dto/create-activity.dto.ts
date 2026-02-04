import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  description: string;

  @IsString()
  act_type: string;

  @IsOptional()
  @IsString()
  representative?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsDateString()
  done_at: string;
}
