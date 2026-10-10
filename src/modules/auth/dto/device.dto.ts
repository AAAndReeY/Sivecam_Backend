import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CHALLENGE_PURPOSES, ChallengePurpose } from '../device/device-crypto';

export class DeviceChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsIn(CHALLENGE_PURPOSES)
  purpose: ChallengePurpose;
}

// Prueba de posesión de la llave del dispositivo: firma del reto pedido antes
export class DeviceProofDto {
  @IsUUID()
  challenge_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  signature: string;

  // Solo en la primera vinculación: llave pública P-256 (SPKI DER o X9.63, base64)
  @IsString()
  @IsOptional()
  @MaxLength(1024)
  public_key?: string;

  // Solo en la primera vinculación: cadena de Android Key Attestation (DER base64, hoja primero)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(8192, { each: true })
  attestation?: string[];

  // Descripción del equipo para el admin (ej. "Samsung SM-A546E, Android 14")
  @IsString()
  @IsOptional()
  @MaxLength(150)
  device_name?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refresh_token: string;

  @IsUUID()
  challenge_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  signature: string;
}
