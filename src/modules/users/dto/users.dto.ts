import {
    IsString, IsNotEmpty, IsOptional, IsEmail,
    IsDateString, IsIn, MinLength, MaxLength, Matches,
    IsBoolean,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

const PHONE_PE_REGEX = /^9\d{8}$/;
const PHONE_PE_MESSAGE =
    'Teléfono inválido. Debe empezar con 9 y tener 9 dígitos (ej. 987654321).';

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

    @IsOptional() @IsBoolean()
    inclusivo?: boolean;
}

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

    @IsOptional() @IsDateString()
    fecha_nacimiento?: string;

    @IsOptional() @IsIn(['nombrado', 'contratado'])
    tipo_contrato?: string;

    @IsOptional() @IsIn(['activo', 'inactivo', 'pendiente'])
    estado_contrato?: string;

    @IsOptional() @IsDateString()
    fecha_inicio_contrato?: string;

    @IsOptional() @IsDateString()
    fecha_fin_contrato?: string;
}

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

export class CreateStaffDto {
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

    @IsOptional() @IsDateString()
    fecha_nacimiento?: string;

    @IsOptional() @IsString() @MaxLength(100)
    cargo?: string;

    @IsOptional() @IsEmail() @MaxLength(255)
    email?: string;

    @IsOptional() @IsString() @Matches(PHONE_PE_REGEX, { message: PHONE_PE_MESSAGE })
    telefono?: string;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) { }

export class LinkPadreAlumnoDto {
    @IsString() @IsNotEmpty()
    padre_doc: string;

    @IsString() @IsNotEmpty()
    alumno_doc: string;
}

export class ResetPasswordDto {
    @IsString() @MinLength(6)
    password: string;
}