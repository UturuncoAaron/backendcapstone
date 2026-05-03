import { IsInt, IsUUID, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportQueryDto {
    @IsUUID()
    seccion_id: string;
    @Type(() => Number)
    @IsInt()
    @Min(1)
    periodo_id: number; 
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    anio_nacimiento_default?: number;
}

export interface CsvRow {
    tipo_documento: string;
    numero_documento: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno?: string;
    fecha_nacimiento?: string;
    email?: string;
    telefono?: string;
    codigo_estudiante?: string;
}

export interface ImportResult {
    total: number;
    creados: number;
    matriculados: number;
    omitidos: number;
    errores: ImportError[];
}
export interface ImportError {
    fila: number;
    numero_documento: string;
    motivo: string;
}