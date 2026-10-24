import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TIME_RE } from '../../auth/access-schedule';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^(?=.*[a-z])(?=.*\d)(?=.*[$%&#]).+$/, {
    message:
      'The password must include at least one uppercase letter, one lowercase letter, one number, and one special character: $, %, &, or #',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(25)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(25)
  lastname: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @Matches(/^[0-9]{8}$/)
  @IsOptional()
  dni?: string;

  @Matches(/^[0-9]{9}$/)
  @IsOptional()
  phone?: string;

  @IsUUID()
  @IsNotEmpty()
  custom_role_id: string;

  // Sesiones simultáneas permitidas. Si no se envía: 50 para OPERATOR, 1 para el resto.
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  max_sessions?: number;

  // Solo puede ingresar desde la app móvil vinculada (fuerza 1 sesión)
  @IsBoolean()
  @IsOptional()
  mobile_only?: boolean;

  // Horario de acceso (hora de Lima, "HH:MM"). null en ambos = sin restricción.
  // Si access_end <= access_start el turno termina al día siguiente.
  @Matches(TIME_RE, { message: 'access_start debe tener el formato HH:MM' })
  @IsOptional()
  access_start?: string | null;

  @Matches(TIME_RE, { message: 'access_end debe tener el formato HH:MM' })
  @IsOptional()
  access_end?: string | null;

  // Días permitidos: 1 = lunes … 7 = domingo
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @IsOptional()
  access_days?: number[];

  // Muestra el pin de "mi ubicación" en el mapa
  @IsBoolean()
  @IsOptional()
  show_location_pin?: boolean;
}
