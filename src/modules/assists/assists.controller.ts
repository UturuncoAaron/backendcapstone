import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { AssistsService } from './assists.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller()
export class AssistsController {
    constructor(private readonly assistsService: AssistsService) { }

    // ── Lecturas ────────────────────────────────────────────────

    // GET /api/courses/:courseId/assists?fecha=YYYY-MM-DD
    // GET /api/courses/:courseId/assists?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
    @Get('courses/:courseId/assists')
    listByCourse(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Query('fecha') fecha?: string,
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
    ) {
        if (fecha) return this.assistsService.getByCursoFecha(courseId, fecha);
        return this.assistsService.getByCurso(courseId, desde, hasta);
    }

    // GET /api/assists/alumno/:alumnoId?cursoId=&desde=&hasta=
    @Get('assists/alumno/:alumnoId')
    listByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query('cursoId') cursoId?: string,
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
    ) {
        return this.assistsService.getByAlumno(alumnoId, cursoId, desde, hasta);
    }

    // GET /api/assists/:id
    @Get('assists/:id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.assistsService.findOne(id);
    }

    // ── Escrituras (solo docente del curso) ─────────────────────

    // POST /api/courses/:courseId/assists  (registrar uno; upsert por alumno+fecha)
    @Post('courses/:courseId/assists')
    register(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: any,
        @Body() dto: {
            alumno_id: string;
            fecha: string;
            presente: boolean;
            justificacion?: string;
        },
    ) {
        return this.assistsService.register({
            curso_id: courseId,
            alumno_id: dto.alumno_id,
            fecha: dto.fecha,
            presente: dto.presente,
            justificacion: dto.justificacion,
        }, user?.sub ?? 'dev');
    }

    // POST /api/courses/:courseId/assists/bulk  (registrar a todos en una fecha)
    @Post('courses/:courseId/assists/bulk')
    registerBulk(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: any,
        @Body() dto: {
            fecha: string;
            alumnos: { alumno_id: string; presente: boolean; justificacion?: string }[];
        },
    ) {
        return this.assistsService.registerBulk({
            curso_id: courseId,
            fecha: dto.fecha,
            alumnos: dto.alumnos,
        }, user?.sub ?? 'dev');
    }

    // PATCH /api/assists/:id
    @Patch('assists/:id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: { presente?: boolean; justificacion?: string | null },
    ) {
        return this.assistsService.update(id, dto, user?.sub ?? 'dev');
    }

    // DELETE /api/assists/:id
    @Delete('assists/:id')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.assistsService.remove(id, user?.sub ?? 'dev');
    }
}