import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateRecordedClassDto {
    @IsString()
    @IsNotEmpty()
    url_original: string;

    @IsString()
    @IsNotEmpty()
    titulo: string;

    @IsOptional()
    @IsString()
    descripcion?: string;
}

export class UpdateRecordedClassDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    titulo?: string;

    @IsOptional()
    @IsString()
    descripcion?: string;

    @IsOptional()
    @IsBoolean()
    oculto?: boolean;
}

export class ToggleRecordedClassDto {
    @IsBoolean()
    oculto: boolean;
}