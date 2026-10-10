import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { DeviceProofDto } from './device.dto';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  // Obligatorio para usuarios "solo app móvil"; la web no lo envía
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceProofDto)
  device?: DeviceProofDto;
}
