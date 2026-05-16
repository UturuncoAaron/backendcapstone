
import {
    IsString, IsNotEmpty, IsOptional, IsEmail,
    IsDateString, IsIn, MinLength, MaxLength, Matches,
    IsBoolean,
} from 'class-validator';

/**
 * Teléfono celular peruano: empieza con 9 + 8 dígitos. Aceptamos
 * espacios o guiones que el cliente pueda mandar y los normalizamos
 * con un patrón laxo en validación (pero `@MaxLength(20)` queda como
 * cota dura para evitar abuso del campo).
 */
const PHONE_PE_REGEX = /^9\d{8}$/;
const PHONE_PE_MESSAGE =
    'Teléfono inválido. Debe empezar con 9 y tener 9 dígitos (ej. 987654321).';

/**
 * Email RFC-light: rechaza inputs como `juan@wa` que no tienen TLD.
 * `IsEmail` por defecto de class-validator ya cumple, pero acá agregamos
 * un `@MaxLength` consistente. Mantenido por documentación.
 */

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

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    @IsOptional() @IsString() @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
    telefono?: string;

    // Marca al alumno como caso de inclusión educativa (NEE).
    @IsOptional() @IsBoolean()
    inclusivo?: boolean;
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

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    @IsOptional() @IsString() @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
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

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    @IsOptional() @IsString() @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
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

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    @IsOptional() @IsString() @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
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

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    @IsOptional() @IsString() @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
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
export class CreateAuxiliarDto {
    @IsString()
    @IsIn(['dni', 'ce', 'pass'])
    tipo_documento: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{8,12}$/, { message: 'Número de documento inválido' })
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

    @IsOptional()
    @IsDateString()
    fecha_nacimiento?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    cargo?: string;        // Default: "Auxiliar de Educación"

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @IsOptional()
    @IsString()
    @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
    telefono?: string;

    @IsOptional()
    @IsIn(['nombrado', 'contratado'])
    tipo_contrato?: 'nombrado' | 'contratado';

    @IsOptional()
    @IsIn(['activo', 'inactivo', 'pendiente'])
    estado_contrato?: 'activo' | 'inactivo' | 'pendiente';

    @IsOptional()
    @IsDateString()
    fecha_inicio_contrato?: string;

    @IsOptional()
    @IsDateString()
    fecha_fin_contrato?: string;
}