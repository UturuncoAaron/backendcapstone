import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateAcademicYearDto {
  @IsInt() @Min(2024) @Max(2099)
  anio: number;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}

export class UpdateAcademicYearDto {
  @IsOptional() @IsDateString()
  fechaInicio?: string;

  @IsOptional() @IsDateString()
  fechaFin?: string;
}

export class SetCondicionFinalDto {
  @IsString() @Length(1, 20)
  condicion: 'aprobado' | 'desaprobado' | 'retirado';

  @IsOptional() @IsString() @Length(0, 300)
  observacion?: string;
}

export class BulkCondicionFinalDto {
  @IsInt() @Min(2024) @Max(2099)
  anio: number;

  @IsOptional() @IsUUID()
  seccion_id?: string;

  @IsOptional() @IsUUID()
  grado_id?: string;

  @IsString() @Length(1, 20)
  condicion: 'pendiente' | 'aprobado' | 'desaprobado';
}

export class CambiarSeccionDto {
  @IsUUID()
  seccion_id: string;
}