import { PartialType } from '@nestjs/mapped-types';
import { CreateSustenanceDto } from './create-sustenance.dto';

export class UpdateSustenanceDto extends PartialType(CreateSustenanceDto) {}
