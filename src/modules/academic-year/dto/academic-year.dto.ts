import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateAcademicYearDto {
  @IsInt()
  @Min(2024)
  @Max(2099)
  anio: number;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}

export class CloseAcademicYearDto {
  /** Motivo opcional registrado en el log de auditoría. */
  @IsOptional()
  @IsString()
  @Length(3, 300)
  motivo?: string;
}

export class SetCondicionFinalDto {
  @IsString()
  @Length(1, 20)
  condicion: 'aprobado' | 'desaprobado' | 'retirado';

  @IsOptional()
  @IsString()
  @Length(0, 300)
  observacion?: string;
}
