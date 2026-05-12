import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ModulePermissionDto {
  @IsString()
  @IsNotEmpty()
  module_key: string;

  @IsBoolean()
  @IsOptional()
  can_access?: boolean;

  @IsBoolean()
  @IsOptional()
  can_create?: boolean;

  @IsBoolean()
  @IsOptional()
  can_edit?: boolean;

  @IsBoolean()
  @IsOptional()
  can_delete?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  visible_fields?: string[];
}

export class LayerPermissionDto {
  @IsString()
  @IsNotEmpty()
  layer_key: string;
}

export class CreateCustomRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowed_jurisdictions?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionDto)
  modules: ModulePermissionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayerPermissionDto)
  layers: LayerPermissionDto[];
}
