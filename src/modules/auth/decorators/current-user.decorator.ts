import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user.js';

/**
 * Inyecta el usuario autenticado (`request.user`) en un parámetro del controller.
 *
 *   @Get('me')
 *   getMe(@CurrentUser() user: AuthUser) { ... }
 *
 * Requiere `JwtAuthGuard` (lo aplica el APP_GUARD global en producción y
 * los controllers que lo declaran explícitamente).
 */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
        const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
        return request.user;
    },
);
