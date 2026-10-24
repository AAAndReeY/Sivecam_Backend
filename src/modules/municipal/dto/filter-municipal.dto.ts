import { Camera } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterMunicipalDto extends SearchDto {
  @IsOptional()
  @IsEnum(Camera)
  camera?: Camera;

  // 'true' = solo ocultas en el mapa, 'false' = solo visibles
  @IsOptional()
  @IsIn(['true', 'false'])
  map_hidden?: string;
}
