import {
  IsString,
  IsOptional,
  IsNumber,
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
  polygon?: number[][] | number[][][];

  @IsOptional()
  @IsIn(['POINT', 'POLYGON', 'POLYLINE', 'MULTI'])
  geom_type?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
