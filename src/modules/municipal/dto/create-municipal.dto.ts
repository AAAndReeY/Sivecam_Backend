import { Camera } from '@prisma/client';
import { IsString, IsNumber, IsEnum, IsBoolean } from 'class-validator';

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
  buttom: boolean;

  @IsBoolean()
  megaphone: boolean;
}
