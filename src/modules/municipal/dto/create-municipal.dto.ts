import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateMunicipalDto {
  @IsString()
  address: string;

  @IsString()
  camera: string;

  @IsOptional()
  @IsString()
  implementation?: string;

  @IsString()
  ip: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  pole: string;

  @IsNumber()
  type: number;
}
