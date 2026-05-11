import { PartialType } from '@nestjs/mapped-types';
import { CreateIncidenceModalityDto } from './create-incidence-modality.dto';

export class UpdateIncidenceModalityDto extends PartialType(CreateIncidenceModalityDto) {}
