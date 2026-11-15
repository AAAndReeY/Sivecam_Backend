import { Shift } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { parseShift } from '../turnos.util';
import { CATEGORIAS, Categoria, PRIORIDADES, Prioridad } from '../tipos-incidencia';

const toShift = ({ value }: { value: any }) => parseShift(value) ?? value;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class GenerarRutasDto {
  @IsOptional()
  @Transform(toShift)
  @IsEnum(Shift)
  turno?: Shift;

  @IsOptional()
  @Matches(FECHA, { message: 'fecha debe ser YYYY-MM-DD' })
  fecha?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(12)
  paradas_por_movil?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  permanencia_min?: number;

  /** Solo estas móviles (ISSI). Vacío = todas las que están en línea. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  issis?: string[];
}

export class ParadaManualDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  permanencia_min?: number;
}

export class RutaManualDto {
  @IsString()
  @IsNotEmpty()
  issi: string;

  @IsOptional()
  @Transform(toShift)
  @IsEnum(Shift)
  turno?: Shift;

  @IsOptional()
  @Matches(FECHA, { message: 'fecha debe ser YYYY-MM-DD' })
  fecha?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titulo: string;

  /** Cargo y nombre de quien ordena (subgerente, alcalde, etc.). Obligatorio. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  ordenado_por: string;

  /** Memorando, oficio u otro documento de sustento. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  documento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;

  @IsOptional()
  @IsBoolean()
  optimizar_orden?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => ParadaManualDto)
  paradas: ParadaManualDto[];
}

export class AsignarDto {
  /** ISSI de la radio (móvil o portátil) o código de la bodycam. */
  @IsString()
  @IsNotEmpty()
  issi: string;

  @IsOptional()
  @IsIn(['MOVIL', 'RADIO', 'BODYCAM'])
  tipo?: 'MOVIL' | 'RADIO' | 'BODYCAM';

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsString()
  incident_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  incident_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  incident_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  referencia?: string;

  @IsOptional()
  @IsInt()
  rank?: number;

  @IsOptional()
  @IsNumber()
  eta_s?: number;

  @IsOptional()
  @IsNumber()
  distance_m?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;

  /** Asignar aunque la móvil ya tenga un despacho abierto. */
  @IsOptional()
  @IsBoolean()
  forzar?: boolean;

  /** Varias unidades a la misma emergencia: todas llevan el mismo grupo (refuerzos incluidos). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  group_id?: string;

  /** Hora de registro de la incidencia (para medir recepción -> despacho). */
  @IsOptional()
  @IsDateString()
  incident_registered_at?: string;

  @IsOptional()
  @IsIn(PRIORIDADES)
  prioridad?: Prioridad;
}

/** Resultados posibles al cerrar o cancelar un despacho. */
export const RESULTADOS_DESPACHO = [
  'ATENDIDO',
  'SIN_NOVEDAD',
  'FALSA_ALARMA',
  'DERIVADO_PNP',
  'DERIVADO_BOMBEROS',
  'DERIVADO_SAMU',
  'NO_UBICADO',
  'REASIGNADO',
  'OTRO',
] as const;

export class CerrarDto {
  @IsOptional()
  @IsIn(RESULTADOS_DESPACHO as unknown as string[])
  resultado?: (typeof RESULTADOS_DESPACHO)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;
}

export class TipoIncidenciaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  tipo: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  corto?: string;

  @IsIn(PRIORIDADES)
  prioridad: Prioridad;

  @IsOptional()
  @IsIn(CATEGORIAS)
  categoria?: Categoria;
}
