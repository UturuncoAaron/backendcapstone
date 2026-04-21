import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ParentPortalService } from './parent-portal.service.js';

// TODO: agregar JwtAuthGuard + Roles('padre') cuando se implemente JWT
@Controller('parent')
export class ParentPortalController {
    constructor(private readonly service: ParentPortalService) { }

    // GET /api/parent/children — padre ve sus hijos
    @Get('children')
    getChildren() {
        // TODO: reemplazar con CurrentUser cuando JWT esté activo
        const padreId = 'hardcoded-padre-id-replace-with-jwt';
        return this.service.getChildren(padreId);
    }

    // GET /api/parent/children/:id/grades — padre ve notas de su hijo
    @Get('children/:id/grades')
    getChildGrades(@Param('id', ParseUUIDPipe) alumnoId: string) {
        // TODO: reemplazar con CurrentUser cuando JWT esté activo
        const padreId = 'hardcoded-padre-id-replace-with-jwt';
        return this.service.getChildGrades(padreId, alumnoId);
    }

    // GET /api/parent/children/:id/attendance — padre ve asistencia de su hijo
    @Get('children/:id/attendance')
    getChildAttendance(@Param('id', ParseUUIDPipe) alumnoId: string) {
        // TODO: reemplazar con CurrentUser cuando JWT esté activo
        const padreId = 'hardcoded-padre-id-replace-with-jwt';
        return this.service.getChildAttendance(padreId, alumnoId);
    }
}