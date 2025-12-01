import { Rol } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { SearchDto } from '../../../common/dto';

export class FilterUserDto extends SearchDto {
  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;
}
