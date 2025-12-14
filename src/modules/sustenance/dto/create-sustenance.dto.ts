import { IsString, IsNumber } from 'class-validator';

export class CreateSustenanceDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}
