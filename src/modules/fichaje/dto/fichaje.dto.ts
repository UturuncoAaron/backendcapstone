import {
    IsString, IsNotEmpty, IsOptional,
    IsIn, IsUUID, IsDateString,
} from 'class-validator';

export class FichajeDto {
    @IsString() @IsNotEmpty()
    codigo_acceso: string;

    @IsString() @IsNotEmpty()
    password: string;
}

export class EditarAsistenciaPersonalDto {
    @IsIn(['presente', 'tardanza', 'falto', 'justificado'])
    estado: string;

    @IsOptional() @IsString()
    hora_entrada?: string;

    @IsOptional() @IsString()
    hora_salida?: string;

    @IsOptional() @IsString()
    motivo_justificacion?: string;

    @IsOptional() @IsString()
    observacion?: string;
}

export class QueryAsistenciaPersonalDto {
    @IsOptional() @IsDateString()
    fecha?: string;

    @IsOptional() @IsUUID()
    cuenta_id?: string;

    @IsOptional() @IsString()
    @IsIn(['presente', 'tardanza', 'falto', 'justificado'])
    estado?: string;

    @IsOptional() @IsString()
    page?: string;

    @IsOptional() @IsString()
    limit?: string;
}

export class HorarioLaboralDto {
    @IsIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'])
    dia_semana: string;

    @IsString() @IsNotEmpty()
    hora_inicio: string;

    @IsString() @IsNotEmpty()
    hora_fin: string;
}