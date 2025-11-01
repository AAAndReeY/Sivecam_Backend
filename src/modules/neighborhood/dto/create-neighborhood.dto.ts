import { IsString, IsOptional, IsNumber, IsUUID } from 'class-validator';

export class CreateNeighborhoodDto {
  @IsString()
  address: string;

  @IsString()
  camera_model: string;

  @IsString()
  camera_password: string;

  @IsString()
  camera_type: string;

  @IsString()
  camera_username: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsString()
  establishment: string;

  @IsOptional()
  @IsString()
  interconnector?: string;

  @IsString()
  jurisdiction_id: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  neighbor_name: string;

  @IsOptional()
  @IsString()
  neighbor_phone?: string;

  @IsString()
  serial: string;
}
