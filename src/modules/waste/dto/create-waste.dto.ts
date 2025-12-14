import { Color } from '@prisma/client';
import { IsString, IsNumber, IsEnum } from 'class-validator';

export class CreateWasteDto {
  @IsString()
  name: string;

  @IsEnum(Color)
  color: Color;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}
