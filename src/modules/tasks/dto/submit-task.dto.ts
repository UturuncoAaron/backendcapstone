import { IsString, IsOptional } from 'class-validator';

export class SubmitTaskDto {
    @IsString()
    @IsOptional()
    url_archivo?: string;

    @IsString()
    @IsOptional()
    respuesta_texto?: string;
}