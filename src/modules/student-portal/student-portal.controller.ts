import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { StudentPortalService } from './student-portal.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('alumno')
@Controller('student')
export class StudentPortalController {
    constructor(private readonly service: StudentPortalService) { }

    @Get('psicologia/informes')
    getInformes(@CurrentUser() user: AuthUser) {
        return this.service.getInformes(user.id);
    }

    @Get('psicologia/informes/:id/pdf')
    getInformePdf(
        @Param('id', ParseUUIDPipe) informeId: string,
        @CurrentUser() user: AuthUser,
        @Res() res: Response,
    ) {
        return this.service.getInformePdf(user.id, informeId, res);
    }

    @Get('psicologia/archivos')
    getArchivos(
        @Query('categoria') categoria: 'ficha' | 'test' | undefined,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getArchivos(user.id, categoria);
    }

    @Get('psicologia/archivos/:id/url')
    getArchivoUrl(
        @Param('id', ParseUUIDPipe) archivoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getArchivoUrl(user.id, archivoId);
    }

    @Get('psicologia/archivos/:id/preview')
    getArchivoPreviewUrl(
        @Param('id', ParseUUIDPipe) archivoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getArchivoPreviewUrl(user.id, archivoId);
    }
}