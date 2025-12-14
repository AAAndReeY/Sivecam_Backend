import { Camera } from '@prisma/client';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateMunicipalDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsEnum(Camera)
  camera: Camera;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsBoolean()
  @IsOptional()
  buttom?: boolean;

  @IsBoolean()
  @IsOptional()
  megaphone?: boolean;

  @IsNumber()
  @IsOptional()
  angle?: number;

  @IsNumber()
  @IsOptional()
  radius?: number;
}
