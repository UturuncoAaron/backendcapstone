import { IsString, IsUUID, IsBoolean, Length } from 'class-validator';

export class CreatePermisoDto {
    @IsUUID()
    cuentaId: string;

    @IsString()
    @Length(1, 50)
    modulo: string;

    @IsString()
    @Length(1, 50)
    accion: string;
}

export class UpdatePermisoDto {
    @IsBoolean()
    activo: boolean;
}

export class CheckPermisoDto {
    @IsUUID()
    cuentaId: string;

    @IsString()
    modulo: string;

    @IsString()
    accion: string;
}