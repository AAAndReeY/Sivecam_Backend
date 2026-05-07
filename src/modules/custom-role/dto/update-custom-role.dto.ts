import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomRoleDto } from './create-custom-role.dto';

export class UpdateCustomRoleDto extends PartialType(CreateCustomRoleDto) {}
