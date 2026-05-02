import { IsOptional, IsString, MinLength, IsIn } from 'class-validator';

export class UpdateFullDto {
    // ── Documento (solo admin editando otro usuario) ───────────────────────
    @IsOptional() @IsString() tipo_documento?: string;
    @IsOptional() @IsString() numero_documento?: string;

    // ── Datos personales ──────────────────────────────────────────────────
    @IsOptional() @IsString() nombre?: string;
    @IsOptional() @IsString() apellido_paterno?: string;
    @IsOptional() @IsString() apellido_materno?: string;
    @IsOptional() @IsString() telefono?: string;
    @IsOptional() @IsString() email?: string;

    // ── Campos por rol ────────────────────────────────────────────────────
    @IsOptional() @IsString() especialidad?: string;
    @IsOptional() @IsString() titulo_profesional?: string;
    @IsOptional() @IsString() colegiatura?: string;
    @IsOptional() @IsString() cargo?: string;

    @IsOptional()
    @IsString()
    @IsIn(['padre', 'madre', 'tutor', 'apoderado'])
    relacion?: string;

    // ── Contraseña (opcional) ─────────────────────────────────────────────
    // current_password requerido solo cuando isSelf = true
    @IsOptional() @IsString() current_password?: string;

    @IsOptional()
    @IsString()
    @MinLength(8)
    new_password?: string;
}