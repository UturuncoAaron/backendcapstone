import {
    IsBoolean, IsOptional, IsString, MaxLength,
} from 'class-validator';

export class ToggleSemanaDto {
    @IsBoolean()
    oculta: boolean;
}

export class UpdateSemanaDto {
    @IsOptional() @IsBoolean()
    oculta?: boolean;

    @IsOptional() @IsString() @MaxLength(500)
    descripcion?: string;
}
