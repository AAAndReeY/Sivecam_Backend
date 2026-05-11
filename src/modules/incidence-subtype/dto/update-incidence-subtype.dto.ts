import { PartialType } from '@nestjs/mapped-types';
import { CreateIncidenceSubtypeDto } from './create-incidence-subtype.dto';

export class UpdateIncidenceSubtypeDto extends PartialType(CreateIncidenceSubtypeDto) {}
