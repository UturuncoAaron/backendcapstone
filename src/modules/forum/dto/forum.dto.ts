import {
    IsString, IsNotEmpty, IsOptional, IsBoolean,
    IsInt, Min, Max, MaxLength,
} from 'class-validator';

export class CreateForumBodyDto {
    @IsString() @IsNotEmpty() @MaxLength(200)
    titulo: string;

    @IsOptional() @IsString() @MaxLength(500)
    descripcion?: string;

    @IsOptional() @IsInt() @Min(1) @Max(4)
    bimestre?: number;

    @IsOptional() @IsInt() @Min(1) @Max(20)
    semana?: number;
}

export class ToggleForumDto {
    @IsBoolean()
    oculto: boolean;
}
