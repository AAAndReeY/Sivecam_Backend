import { Camera } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterMunicipalDto extends SearchDto {
  @IsOptional()
  @IsEnum(Camera)
  camera?: Camera;
}
