import { IsString, IsUUID } from 'class-validator';

export class CreateIncidenceModalityDto {
  @IsString()
  name: string;

  @IsUUID()
  subtype_id: string;
}
