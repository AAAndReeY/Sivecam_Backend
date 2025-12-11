import { Color } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterWasteDto extends SearchDto {
  @IsOptional()
  @IsEnum(Color)
  color?: Color;
}
