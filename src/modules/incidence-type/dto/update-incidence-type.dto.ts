import { PartialType } from '@nestjs/mapped-types';
import { CreateIncidenceTypeDto } from './create-incidence-type.dto';

export class UpdateIncidenceTypeDto extends PartialType(CreateIncidenceTypeDto) {}
