import { PartialType } from '@nestjs/mapped-types';
import { CreateCommunalDto } from './create-communal.dto';

export class UpdateCommunalDto extends PartialType(CreateCommunalDto) {}
