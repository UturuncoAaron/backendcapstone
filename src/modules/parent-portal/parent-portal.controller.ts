import { Controller, Get, Param } from '@nestjs/common';
import { ParentPortalService } from './parent-portal.service.js';

// TODO: agregar JwtAuthGuard + Roles('padre') cuando se implemente JWT
@Controller('parent')
export class ParentPortalController {
    constructor(private readonly service: ParentPortalService) { }

    @Get('children')
    async getChildren() {
        // TODO: reemplazar 'hardcoded-id' con @CurrentUser() cuando JWT esté activo
        // return this.service.getChildren(user.sub);
        return { message: 'JWT pendiente — conectar con CurrentUser' };
    }

    @Get('children/:id/grades')
    async getChildGrades(@Param('id') alumnoId: string) {
        // TODO: reemplazar con CurrentUser
        return { message: 'JWT pendiente', alumnoId };
    }

    @Get('children/:id/attendance')
    async getChildAttendance(@Param('id') alumnoId: string) {
        // TODO: reemplazar con CurrentUser
        return { message: 'JWT pendiente', alumnoId };
    }
}