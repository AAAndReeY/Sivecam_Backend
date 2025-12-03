import { Brand, Mode } from '@prisma/client';
import { IsString, IsNumber, IsEnum } from 'class-validator';

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
}
