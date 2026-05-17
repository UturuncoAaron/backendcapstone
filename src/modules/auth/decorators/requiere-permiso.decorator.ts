import { SetMetadata } from '@nestjs/common';

export const PERMISO_KEY = 'permiso_requerido';
export const RequierePermiso = (modulo: string, accion: string) =>
    SetMetadata(PERMISO_KEY, { modulo, accion });