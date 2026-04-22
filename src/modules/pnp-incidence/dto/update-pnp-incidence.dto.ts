import { PartialType } from '@nestjs/mapped-types';
import { CreatePnpIncidenceDto } from './create-pnp-incidence.dto';

export class UpdatePnpIncidenceDto extends PartialType(CreatePnpIncidenceDto) {}
