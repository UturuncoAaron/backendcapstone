// ── create-alumno.dto.ts ─────────────────────────────────────────
import {
    IsString, IsNotEmpty, IsOptional, IsEmail,
    IsIn, MinLength, MaxLength, IsDateString,
} from 'class-validator';

export class CreateAlumnoDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    /**
     * Opcional. La contraseña inicial se genera siempre a partir del
     * `numero_documento` y `password_changed` queda en `false` hasta el
     * primer cambio del usuario. Se mantiene en el DTO solo para
     * compatibilidad con clientes legacy.
     */
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

    @IsOptional() @IsDateString()
    fecha_nacimiento?: string;

    @IsOptional() @IsEmail()
    email?: string;

    @IsOptional() @IsString() @MaxLength(20)
    telefono?: string;
}


// ── create-docente.dto.ts ────────────────────────────────────────
export class CreateDocenteDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    /** Opcional: la contraseña inicial siempre se genera desde el DNI. */
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
}


// ── create-padre.dto.ts ──────────────────────────────────────────
export class CreatePadreDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    /** Opcional: la contraseña inicial siempre se genera desde el DNI. */
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
}


// ── create-admin.dto.ts ──────────────────────────────────────────
export class CreateAdminDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString() @IsNotEmpty() @MaxLength(20)
    numero_documento: string;

    /** Opcional: la contraseña inicial siempre se genera desde el DNI. */
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
    telefono?: string;   // ← agregar esto
}


// ── link-padre-alumno.dto.ts ─────────────────────────────────────
export class LinkPadreAlumnoDto {
    @IsString() @IsNotEmpty()
    padre_doc: string;

    @IsString() @IsNotEmpty()
    alumno_doc: string;
}


// ── reset-password.dto.ts ────────────────────────────────────────
export class ResetPasswordDto {
    @IsString() @MinLength(6)
    password: string;
}
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
}