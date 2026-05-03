import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { ParentPortalService } from './parent-portal.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('padre')
@Controller('parent')
export class ParentPortalController {
    constructor(private readonly service: ParentPortalService) { }

    // GET /api/parent/children
    @Get('children')
    getChildren(@CurrentUser() user: any) {
        return this.service.getChildren(user.id);
    }

    // GET /api/parent/children/:id/grades
    @Get('children/:id/grades')
    getChildGrades(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: any,
    ) {
        return this.service.getChildGrades(user.id, alumnoId);
    }

    // GET /api/parent/children/:id/attendance
    @Get('children/:id/attendance')
    getChildAttendance(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: any,
    ) {
        return this.service.getChildAttendance(user.id, alumnoId);
    }

    // GET /api/parent/children/:id/libretas
    @Get('children/:id/libretas')
    getChildLibretas(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: any,
    ) {
        return this.service.getChildLibretas(user.id, alumnoId);
    }
}