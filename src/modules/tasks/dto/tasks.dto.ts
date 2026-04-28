import {
    IsString, IsNotEmpty, IsOptional, IsDateString,
    IsInt, IsBoolean, Min, Max, ValidateNested,
    ArrayMinSize, IsUUID, IsArray, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Opción dentro de una pregunta ────────────────────────────────
export class CreateOpcionDto {
    @IsString() @IsNotEmpty()
    texto: string;

    @IsBoolean()
    es_correcta: boolean;

    @IsOptional() @IsInt() @Min(0)
    orden?: number;
}

// ── Pregunta dentro de una tarea ─────────────────────────────────
export class CreatePreguntaDto {
    @IsString() @IsNotEmpty()
    enunciado: string;

    @IsOptional() @IsInt() @Min(1)
    puntos?: number;

    @IsOptional() @IsInt() @Min(0)
    orden?: number;

    @IsArray()
    @ArrayMinSize(2)
    @ValidateNested({ each: true })
    @Type(() => CreateOpcionDto)
    opciones: CreateOpcionDto[];
}

// ── Crear tarea ──────────────────────────────────────────────────
export class CreateTaskDto {
    @IsString() @IsNotEmpty()
    titulo: string;

    @IsOptional() @IsIn(['tarea', 'examen'])
    tipo?: 'tarea' | 'examen';

    @IsOptional() @IsString()
    instrucciones?: string;

    // Archivo enunciado subido por el docente a R2
    @IsOptional() @IsString()
    enunciado_storage_key?: string;

    // O link externo (Drive, YouTube, etc.)
    @IsOptional() @IsString()
    enunciado_url?: string;

    @IsDateString()
    fecha_limite: string;

    @IsOptional() @IsInt() @Min(1) @Max(4)
    bimestre?: number;

    @IsOptional() @IsInt() @Min(1) @Max(20)
    semana?: number;

    @IsOptional() @IsInt() @Min(1) @Max(20)
    puntos_max?: number;

    @IsOptional() @IsBoolean()
    permite_alternativas?: boolean;

    @IsOptional() @IsBoolean()
    permite_archivo?: boolean;

    @IsOptional() @IsBoolean()
    permite_texto?: boolean;

    // Preguntas opcionales — solo si permite_alternativas = true
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreatePreguntaDto)
    preguntas?: CreatePreguntaDto[];
}

// ── Activar / desactivar tarea ───────────────────────────────────
export class ToggleTaskDto {
    @IsBoolean()
    activo: boolean;
}

// ── Entregar tarea (alumno) ──────────────────────────────────────
export class SubmitTaskDto {
    // Para archivo subido a R2
    @IsOptional() @IsString()
    storage_key?: string;

    @IsOptional() @IsString()
    nombre_archivo?: string;

    // Para respuesta de texto
    @IsOptional() @IsString()
    respuesta_texto?: string;
}

// ── Respuestas a alternativas ────────────────────────────────────
export class RespuestaDto {
    @IsUUID()
    pregunta_id: string;

    @IsUUID()
    opcion_id: string;
}

export class SubmitAlternativasDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RespuestaDto)
    respuestas: RespuestaDto[];
}

// ── Calificar entrega (docente — solo archivo/texto) ─────────────
export class GradeTaskDto {
    @IsInt() @Min(0) @Max(20)
    calificacion_manual: number;

    @IsOptional() @IsString()
    comentario_docente?: string;
}