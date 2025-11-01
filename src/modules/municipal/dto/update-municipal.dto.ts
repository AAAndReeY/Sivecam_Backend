import { PartialType } from '@nestjs/mapped-types';
import { CreateMunicipalDto } from './create-municipal.dto';

export class UpdateMunicipalDto extends PartialType(CreateMunicipalDto) {}
