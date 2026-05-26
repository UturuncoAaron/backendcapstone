import {
    IsBoolean, IsOptional, IsString, MaxLength,
    IsInt, Min, Max,
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

export class AddNextSemanaDto {
    @IsInt()
    @Min(1)
    @Max(4)
    bimestre: number;
}