import { Camera } from '@prisma/client';
import { JsonObject } from '@prisma/client/runtime/library';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsJSON,
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

  @IsJSON()
  @IsOptional()
  geometry?: JsonObject;
}
