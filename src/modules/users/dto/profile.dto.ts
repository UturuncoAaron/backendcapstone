import {
    IsOptional, IsString, MinLength, IsIn, IsBoolean, Matches, IsEmail, MaxLength,
} from 'class-validator';

/**
 * Teléfono celular peruano: empieza con 9 + 8 dígitos.
 * Mantenido inline para que el DTO siga siendo autocontenida (sin
 * crear un módulo `validators` cruzado entre features por una sola
 * regex).
 */
const PHONE_PE_REGEX = /^9\d{8}$/;
const PHONE_PE_MESSAGE =
    'Teléfono inválido. Debe empezar con 9 y tener 9 dígitos (ej. 987654321).';

export class UpdateFullDto {
    // ── Documento (solo admin editando otro usuario) ───────────────────────
    @IsOptional() @IsString() tipo_documento?: string;
    @IsOptional() @IsString() numero_documento?: string;

    // ── Datos personales ──────────────────────────────────────────────────
    @IsOptional() @IsString() nombre?: string;
    @IsOptional() @IsString() apellido_paterno?: string;
    @IsOptional() @IsString() apellido_materno?: string;

    @IsOptional() @IsString()
    @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
    telefono?: string;

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    // ── Campos por rol ────────────────────────────────────────────────────
    @IsOptional() @IsString() especialidad?: string;
    @IsOptional() @IsString() titulo_profesional?: string;
    @IsOptional() @IsString() colegiatura?: string;
    @IsOptional() @IsString() cargo?: string;

    @IsOptional()
    @IsString()
    @IsIn(['padre', 'madre', 'tutor', 'apoderado'])
    relacion?: string;

    // ── Específico de alumno ──────────────────────────────────────────────
    // Marca al alumno como caso de inclusión educativa (NEE).
    @IsOptional() @IsBoolean()
    inclusivo?: boolean;

    // ── Contraseña (opcional) ─────────────────────────────────────────────
    // current_password requerido solo cuando isSelf = true
    @IsOptional() @IsString() current_password?: string;

    @IsOptional()
    @IsString()
    @MinLength(8)
    new_password?: string;
}