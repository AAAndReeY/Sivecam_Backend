import { Brand, Mode } from '@prisma/client';
import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';

export class CreateCommunalDto {
  @IsString()
  address: string;

  @IsEnum(Brand)
  brand: Brand;

  @IsEnum(Mode)
  mode: Mode;

  @IsString()
  neighbor: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  @IsOptional()
  user?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  serial?: string;

  @IsString()
  phone?: string;
}
