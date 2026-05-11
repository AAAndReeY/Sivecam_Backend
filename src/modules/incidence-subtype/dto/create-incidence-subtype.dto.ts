import { IsString, IsUUID } from 'class-validator';

export class CreateIncidenceSubtypeDto {
  @IsString()
  name: string;

  @IsUUID()
  type_id: string;
}
