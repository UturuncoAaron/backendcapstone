import {
    IsOptional, IsString, MinLength, IsIn, IsBoolean, Matches, IsEmail, MaxLength, IsDateString,
} from 'class-validator';

const PHONE_PE_REGEX = /^9\d{8}$/;
const PHONE_PE_MESSAGE =
    'Teléfono inválido. Debe empezar con 9 y tener 9 dígitos (ej. 987654321).';

export class UpdateFullDto {
    @IsOptional() @IsString() tipo_documento?: string;
    @IsOptional() @IsString() numero_documento?: string;

    @IsOptional() @IsString() nombre?: string;
    @IsOptional() @IsString() apellido_paterno?: string;
    @IsOptional() @IsString() apellido_materno?: string;

    @IsOptional() @IsString()
    @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
    telefono?: string;

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    @IsOptional() @IsDateString() fecha_nacimiento?: string;

    @IsOptional() @IsString() especialidad?: string;
    @IsOptional() @IsString() titulo_profesional?: string;
    @IsOptional() @IsString() colegiatura?: string;
    @IsOptional() @IsString() cargo?: string;

    @IsOptional()
    @IsString()
    @IsIn(['padre', 'madre', 'tutor', 'apoderado'])
    relacion?: string;

    @IsOptional() @IsBoolean()
    inclusivo?: boolean;

    @IsOptional() @IsString() current_password?: string;

    @IsOptional()
    @IsString()
    @MinLength(8)
    new_password?: string;
}