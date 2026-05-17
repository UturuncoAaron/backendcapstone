import {
    Injectable, CanActivate,
    ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISO_KEY } from '../decorators/requiere-permiso.decorator.js';
import { PermissionsService } from '../../permissions/permissions.service.js';

@Injectable()
export class PermisoGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly permissionsService: PermissionsService,
    ) { }

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const permiso = this.reflector.getAllAndOverride<{ modulo: string; accion: string }>(
            PERMISO_KEY,
            [ctx.getHandler(), ctx.getClass()],
        );
        if (!permiso) return true;

        const { user } = ctx.switchToHttp().getRequest();
        if (user?.rol === 'admin') return true;

        const tiene = await this.permissionsService.hasPermiso(
            user.id,
            permiso.modulo,
            permiso.accion,
        );

        if (!tiene) {
            throw new ForbiddenException(
                `Sin permiso para "${permiso.accion}" en "${permiso.modulo}"`,
            );
        }

        return true;
    }
}