import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateComisariaDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}
