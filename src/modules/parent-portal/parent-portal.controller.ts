import {
    Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
 
import { ParentPortalService } from './parent-portal.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard }   from '../auth/guards/roles.guard.js';
import { Roles }        from '../auth/decorators/roles.decorator.js';
import { CurrentUser }  from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';
 
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('padre')
@Controller('parent')
export class ParentPortalController {
    constructor(private readonly service: ParentPortalService) { }

    // GET /api/parent/children
    @Get('children')
    getChildren(@CurrentUser() user: AuthUser) {
        return this.service.getChildren(user.id);
    }

    // GET /api/parent/children/:id/grades
    @Get('children/:id/grades')
    getChildGrades(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildGrades(user.id, alumnoId);
    }

    // GET /api/parent/children/:id/attendance
    @Get('children/:id/attendance')
    getChildAttendance(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildAttendance(user.id, alumnoId);
    }

    // GET /api/parent/children/:id/attendance-general
    @Get('children/:id/attendance-general')
    getChildAttendanceGeneral(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildAttendanceGeneral(user.id, alumnoId);
    }

    // GET /api/parent/children/:id/schedule
    @Get('children/:id/schedule')
    getChildSchedule(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildSchedule(user.id, alumnoId);
    }

    // GET /api/parent/children/:id/libretas
    @Get('children/:id/libretas')
    getChildLibretas(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildLibretas(user.id, alumnoId);
    }
      @Get('children/:id/psicologia/informes')
    getChildInformes(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildInformes(user.id, alumnoId);
    }
 
    // GET /api/parent/children/:id/psicologia/informes/:informeId/pdf
    @Get('children/:id/psicologia/informes/:informeId/pdf')
    getChildInformePdf(
        @Param('id',        ParseUUIDPipe) alumnoId: string,
        @Param('informeId', ParseUUIDPipe) informeId: string,
        @CurrentUser() user: AuthUser,
        @Res() res: Response,
    ) {
        return this.service.getChildInformePdf(user.id, alumnoId, informeId, res);
    }
 
    // GET /api/parent/children/:id/psicologia/archivos?categoria=ficha|test
    @Get('children/:id/psicologia/archivos')
    getChildArchivos(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @Query('categoria') categoria: 'ficha' | 'test' | undefined,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildArchivos(user.id, alumnoId, categoria);
    }
 
    // GET /api/parent/children/:id/psicologia/archivos/:archivoId/url
    @Get('children/:id/psicologia/archivos/:archivoId/url')
    getChildArchivoUrl(
        @Param('id',         ParseUUIDPipe) alumnoId: string,
        @Param('archivoId',  ParseUUIDPipe) archivoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getChildArchivoUrl(user.id, alumnoId, archivoId);
    }
}