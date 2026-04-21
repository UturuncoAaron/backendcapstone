import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params para el endpoint de importación
 * El CSV se recibe como multipart/form-data (campo: file)
 */
export class ImportQueryDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    seccion_id: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    periodo_id: number;

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    anio_nacimiento_default?: number;
}

/**
 * Estructura esperada de cada fila del CSV:
 *
 * tipo_documento | numero_documento | nombre | apellido_paterno | apellido_materno | fecha_nacimiento | email | telefono | codigo_estudiante
 *
 * Columnas obligatorias: tipo_documento, numero_documento, nombre, apellido_paterno
 * Columnas opcionales:   apellido_materno, fecha_nacimiento, email, telefono, codigo_estudiante
 *
 * Ejemplo de fila CSV:
 * dni,12345678,Juan,García,López,2010-03-15,juan@mail.com,,EST001
 */
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

/**
 * Resultado de la importación
 */
export interface ImportResult {
    total: number;
    creados: number;
    matriculados: number;
    omitidos: number;        // ya existían
    errores: ImportError[];
}

export interface ImportError {
    fila: number;
    numero_documento: string;
    motivo: string;
}