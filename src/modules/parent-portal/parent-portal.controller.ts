import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ParentPortalService } from './parent-portal.service.js';

// TODO: reemplazar @Query('padreId') con @CurrentUser() cuando JWT esté activo
@Controller('parent')
export class ParentPortalController {
    constructor(private readonly service: ParentPortalService) { }

    // GET /api/parent/children?padreId=uuid
    @Get('children')
    getChildren(@Query('padreId') padreId: string) {
        return this.service.getChildren(padreId);
    }

    // GET /api/parent/children/:id/grades?padreId=uuid
    @Get('children/:id/grades')
    getChildGrades(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @Query('padreId') padreId: string,
    ) {
        return this.service.getChildGrades(padreId, alumnoId);
    }

    // GET /api/parent/children/:id/attendance?padreId=uuid
    @Get('children/:id/attendance')
    getChildAttendance(
        @Param('id', ParseUUIDPipe) alumnoId: string,
        @Query('padreId') padreId: string,
    ) {
        return this.service.getChildAttendance(padreId, alumnoId);
    }
}