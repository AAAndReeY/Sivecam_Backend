import { PartialType } from '@nestjs/mapped-types';
import { CreateGpsZonaDto } from './create-gps-zona.dto';

export class UpdateGpsZonaDto extends PartialType(CreateGpsZonaDto) {}
