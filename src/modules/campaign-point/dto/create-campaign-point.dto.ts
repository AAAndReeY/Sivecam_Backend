import {
  IsString,
  IsOptional,
  IsNumber,
  IsObject,
  IsIn,
} from 'class-validator';

export class CreateCampaignPointDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsObject()
  polygon?: object;

  @IsOptional()
  @IsIn(['POINT', 'POLYGON', 'POLYLINE', 'MULTI'])
  geom_type?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
