import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class LoginDto {
    @IsIn(['dni', 'ce', 'pasaporte'])
    tipo_documento: string;

    @IsString()
    @IsNotEmpty()
    numero_documento: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}