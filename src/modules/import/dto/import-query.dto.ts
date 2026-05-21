import { IsNotEmpty, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CsvRow {
    tipo_documento: string;
    numero_documento: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno?: string;
    fecha_nacimiento?: string;
    email?: string;
    telefono?: string;
}

export interface ImportError {
    fila: number;
    numero_documento: string;
    motivo: string;
}

export interface ImportResult {
    total: number;
    creados: number;
    matriculados: number;
    omitidos: number;
    errores: ImportError[];
}

export class ImportQueryDto {
    @IsUUID()
    @IsNotEmpty()
    seccion_id: string;

    @Type(() => Number)
    @IsInt()
    @Min(2020)
    @Max(2100)
    anio: number;
}