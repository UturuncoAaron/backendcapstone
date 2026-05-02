import { IsString, IsOptional, IsEmail, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional() @IsString() @MaxLength(100)
    nombre?: string;

    @IsOptional() @IsString() @MaxLength(100)
    apellido_paterno?: string;

    @IsOptional() @IsString() @MaxLength(100)
    apellido_materno?: string;

    @IsOptional() @IsString() @MaxLength(20)
    telefono?: string;
}

export class UpdateEmailDto {
    @IsEmail()
    email: string;

    @IsString() @MinLength(6)
    password: string;
}

export class UpdatePasswordDto {
    @IsString() @MinLength(6)
    current_password: string;

    @IsString() @MinLength(8)
    new_password: string;
}