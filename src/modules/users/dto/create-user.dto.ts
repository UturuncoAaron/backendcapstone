import {
    IsString, IsNotEmpty, IsIn, IsOptional,
    IsEmail, MinLength, MaxLength, IsDateString,
} from 'class-validator';

export class CreateUserDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    numero_documento: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    nombre: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    apellido_paterno: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    apellido_materno?: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @IsIn(['alumno', 'docente', 'admin', 'padre'])
    rol: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    telefono?: string;

    // ── Alumno ──────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(20)
    codigo_estudiante?: string;

    @IsOptional()
    @IsDateString()
    fecha_nacimiento?: string;

    // ── Docente ──────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(150)
    especialidad?: string;

    @IsOptional()
    @IsString()
    @MaxLength(150)
    titulo_profesional?: string;

    // ── Padre ──────────────────────────────────
    @IsOptional()
    @IsIn(['padre', 'madre', 'tutor', 'apoderado'])
    relacion_familiar?: string;

    // ── Admin ──────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(100)
    cargo?: string;
}