import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] as const;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpsertFranjaDto {
    @IsUUID()
    curso_id: string;

    @IsIn(DIAS)
    dia_semana: string;

    @IsString()
    @Matches(TIME_REGEX, { message: 'hora_inicio debe tener formato HH:MM' })
    hora_inicio: string;

    @IsString()
    @Matches(TIME_REGEX, { message: 'hora_fin debe tener formato HH:MM' })
    hora_fin: string;

    @IsOptional()
    @IsString()
    aula?: string;
}

export class BulkUpsertHorarioDto {
    @IsNotEmpty()
    franjas: UpsertFranjaDto[];
}