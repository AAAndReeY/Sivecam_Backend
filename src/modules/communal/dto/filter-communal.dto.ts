import { Brand, Mode } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { SearchDto } from '../../../common/dto';

/**
 * `map`    → consumo desde la capa del mapa; filtra por `visible_fields`.
 * `manage` → consumo desde el panel administrativo; filtra por `export_fields`.
 * Son dos listas distintas a proposito: el panel maneja datos sensibles
 * (telefono del vecino, usuario y password) que no deben salir al mapa.
 */
export type CommunalScope = 'map' | 'manage';

export class FilterCommunalDto extends SearchDto {
  @IsOptional()
  @IsEnum(Brand)
  brand?: Brand;

  @IsOptional()
  @IsEnum(Mode)
  mode?: Mode;

  @IsOptional()
  @IsIn(['map', 'manage'])
  scope?: CommunalScope;
}
