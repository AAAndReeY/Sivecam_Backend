import { IsString, IsNumber, IsBoolean } from 'class-validator';

export class CreateStopDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsBoolean()
  authorized: boolean;
}
