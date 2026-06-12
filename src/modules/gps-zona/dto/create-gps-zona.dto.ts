import { IsBoolean, IsHexColor, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGpsZonaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsNotEmpty()
  geojson: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsString()
  @IsOptional()
  radios_issi?: string;
}
