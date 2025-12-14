import { PartialType } from '@nestjs/mapped-types';
import { CreateDefenseDto } from './create-defense.dto';

export class UpdateDefenseDto extends PartialType(CreateDefenseDto) {}
