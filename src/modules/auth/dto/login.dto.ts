import { IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
    @IsString()
    @IsNotEmpty()
    codigo_acceso: string;

    @IsString()
    @MinLength(4)
    password: string;
}

export class ChangePasswordDto {
    @IsOptional()
    @IsString()
    current_password?: string;
    @IsString()
    @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
    new_password: string;
}