import { Brand, Mode } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterCommunalDto extends SearchDto {
  @IsOptional()
  @IsEnum(Brand)
  brand?: Brand;

  @IsOptional()
  @IsEnum(Mode)
  mode?: Mode;
}
