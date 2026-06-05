import { IsInt, IsOptional, Min, Max, IsUUID, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export type UnifiedReportScope = 'academic_general' | 'section_summary' | 'teacher_attendance_range' | 'staff_attendance_range' | 'course_ranking' | 'student_individual';
export type UnifiedReportFormat = 'xlsx' | 'pdf' | 'csv' | 'json';

export class QueryReportDto {
    @IsIn(['academic_general', 'section_summary', 'teacher_attendance_range', 'staff_attendance_range', 'course_ranking', 'student_individual'])
    scope!: UnifiedReportScope;

    @IsOptional()
    @IsIn(['xlsx', 'pdf', 'csv', 'json'])
    format?: UnifiedReportFormat = 'xlsx';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    anio?: number;

    @IsOptional()
    @IsUUID()
    periodo_id?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(4)
    bimestre?: number;

    @IsOptional()
    @IsUUID()
    grado_id?: string;

    @IsOptional()
    @IsUUID()
    seccion_id?: string;

    @IsOptional()
    @IsUUID()
    curso_id?: string;

    @IsOptional()
    @IsUUID()
    alumno_id?: string;

    @IsOptional()
    @IsDateString()
    fecha_inicio?: string;

    @IsOptional()
    @IsDateString()
    fecha_fin?: string;

    @IsOptional()
    @IsUUID()
    cuenta_id?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(20)
    umbral?: number = 11;
}