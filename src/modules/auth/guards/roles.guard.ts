import {
    Injectable, CanActivate,
    ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(ctx: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(
            ROLES_KEY,
            [ctx.getHandler(), ctx.getClass()],
        );

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const { user } = ctx.switchToHttp().getRequest();

        if (!requiredRoles.includes(user?.rol)) {
            throw new ForbiddenException(
                `Acceso denegado. Se requiere rol: ${requiredRoles.join(' o ')}`,
            );
        }

        return true;
    }
}