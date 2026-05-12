import { IsString } from 'class-validator';

export class CreateIncidenceTypeDto {
  @IsString()
  name: string;
}
