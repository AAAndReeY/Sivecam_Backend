import { PartialType } from '@nestjs/mapped-types';
import { CreateComisariaDto } from './create-comisaria.dto';

export class UpdateComisariaDto extends PartialType(CreateComisariaDto) {}
