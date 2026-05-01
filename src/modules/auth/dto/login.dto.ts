import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
    @IsString()
    @IsNotEmpty()
    codigo_acceso: string;

    @IsString()
    @MinLength(4)
    password: string;
}

export class ChangePasswordDto {
    @IsString()
    @MinLength(6)
    current_password: string;

    @IsString()
    @MinLength(6)
    new_password: string;
}