import {
    IsString, IsNotEmpty, IsOptional, IsEmail,
    IsIn, MinLength, MaxLength, IsDateString,
} from 'class-validator';

// ── CreateAlumnoDto ──────────────────────────────────────────────
export class CreateAlumnoDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    @IsOptional() @IsString() @MinLength(6)
    password?: string;

    @IsOptional() @IsString() @MaxLength(20)
    codigo_estudiante?: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    nombre: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    apellido_paterno: string;

    @IsOptional() @IsString() @MaxLength(100)
    apellido_materno?: string;

    @IsDateString()
    fecha_nacimiento: string;

    @IsOptional() @IsEmail()
    email?: string;

    @IsOptional() @IsString() @MaxLength(20)
    telefono?: string;
}

// ── CreateDocenteDto ─────────────────────────────────────────────
export class CreateDocenteDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    @IsOptional() @IsString() @MinLength(6)
    password?: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    nombre: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    apellido_paterno: string;

    @IsOptional() @IsString() @MaxLength(100)
    apellido_materno?: string;

    @IsOptional() @IsString() @MaxLength(150)
    especialidad?: string;

    @IsOptional() @IsString() @MaxLength(150)
    titulo_profesional?: string;

    @IsOptional() @IsEmail()
    email?: string;

    @IsOptional() @IsString() @MaxLength(20)
    telefono?: string;

    // ── v6: fecha de nacimiento ──────────────────────────────────
    @IsOptional() @IsDateString()
    fecha_nacimiento?: string;

    // ── v6: contrato ─────────────────────────────────────────────
    @IsOptional() @IsIn(['nombrado', 'contratado'])
    tipo_contrato?: string;

    @IsOptional() @IsIn(['activo', 'inactivo', 'pendiente'])
    estado_contrato?: string;

    @IsOptional() @IsDateString()
    fecha_inicio_contrato?: string;

    @IsOptional() @IsDateString()
    fecha_fin_contrato?: string;
}

// ── CreatePadreDto ───────────────────────────────────────────────
export class CreatePadreDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    @IsOptional() @IsString() @MinLength(6)
    password?: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    nombre: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    apellido_paterno: string;

    @IsOptional() @IsString() @MaxLength(100)
    apellido_materno?: string;

    @IsIn(['padre', 'madre', 'tutor', 'apoderado'])
    relacion: string;

    @IsOptional() @IsEmail()
    email?: string;

    @IsOptional() @IsString() @MaxLength(20)
    telefono?: string;

    @IsOptional() @IsDateString()
    fecha_nacimiento?: string;
}

// ── CreateAdminDto ───────────────────────────────────────────────
export class CreateAdminDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    @IsOptional() @IsString() @MinLength(6)
    password?: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    nombre: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    apellido_paterno: string;

    @IsOptional() @IsString() @MaxLength(100)
    apellido_materno?: string;

    @IsOptional() @IsString() @MaxLength(100)
    cargo?: string;

    @IsOptional() @IsEmail()
    email?: string;

    @IsOptional() @IsString() @MaxLength(20)
    telefono?: string;

    @IsOptional() @IsDateString()
    fecha_nacimiento?: string;
}

// ── CreatePsicologaDto ───────────────────────────────────────────
export class CreatePsicologaDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    nombre: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    apellido_paterno: string;

    @IsOptional() @IsString() @MaxLength(100)
    apellido_materno?: string;

    @IsOptional() @IsString() @MaxLength(150)
    especialidad?: string;

    @IsOptional() @IsString() @MaxLength(50)
    colegiatura?: string;

    @IsOptional() @IsEmail()
    email?: string;

    @IsOptional() @IsString() @MaxLength(20)
    telefono?: string;

    @IsOptional() @IsDateString()
    fecha_nacimiento?: string;
}

// ── LinkPadreAlumnoDto ───────────────────────────────────────────
export class LinkPadreAlumnoDto {
    @IsString() @IsNotEmpty()
    padre_doc: string;

    @IsString() @IsNotEmpty()
    alumno_doc: string;
}

// ── ResetPasswordDto ─────────────────────────────────────────────
export class ResetPasswordDto {
    @IsString() @MinLength(6)
    password: string;
}