import { IsString, IsNumber } from 'class-validator';

export class CreateDefenseDto {
  @IsString()
  address: string;

  @IsString()
  place: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}
