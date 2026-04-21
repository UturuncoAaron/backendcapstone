import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { LiveClassesService } from './live-classes.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { EstadoClase } from './entities/live-class.entity.js';

@Controller()
export class LiveClassesController {
    constructor(private readonly liveClassesService: LiveClassesService) { }

    // ── CLASES EN VIVO ──────────────────────────────────────────

    // GET /api/courses/:courseId/live-classes
    @Get('courses/:courseId/live-classes')
    findByCourse(@Param('courseId', ParseUUIDPipe) courseId: string) {
        return this.liveClassesService.findByCourse(courseId);
    }

    // GET /api/live-classes/:id
    @Get('live-classes/:id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.liveClassesService.findOne(id);
    }

    // POST /api/courses/:courseId/live-classes
    @Post('courses/:courseId/live-classes')
    create(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: {
            titulo: string;
            descripcion?: string;
            fecha_hora: string;
            duracion_min?: number;
            link_reunion: string;
        },
    ) {
        return this.liveClassesService.create({
            ...dto,
            curso_id: courseId,
            fecha_hora: new Date(dto.fecha_hora),
        });
    }

    // PATCH /api/live-classes/:id
    @Patch('live-classes/:id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: {
            titulo?: string;
            descripcion?: string;
            fecha_hora?: string;
            duracion_min?: number;
            link_reunion?: string;
        },
    ) {
        const parsed = { ...dto } as any;
        if (dto.fecha_hora) parsed.fecha_hora = new Date(dto.fecha_hora);
        return this.liveClassesService.update(
            id, parsed,
            user?.sub ?? 'dev',
            user?.rol ?? 'admin',
        );
    }

    // PATCH /api/live-classes/:id/status
    @Patch('live-classes/:id/status')
    updateEstado(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: { estado: EstadoClase },
    ) {
        return this.liveClassesService.updateEstado(
            id, dto.estado,
            user?.sub ?? 'dev',
            user?.rol ?? 'admin',
        );
    }

    // DELETE /api/live-classes/:id
    @Delete('live-classes/:id')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.liveClassesService.remove(
            id,
            user?.sub ?? 'dev',
            user?.rol ?? 'admin',
        );
    }

    // ── ASISTENCIAS ─────────────────────────────────────────────

    // GET /api/live-classes/:id/attendance
    @Get('live-classes/:id/attendance')
    getAttendance(@Param('id', ParseUUIDPipe) id: string) {
        return this.liveClassesService.getAttendance(id);
    }

    // POST /api/live-classes/:id/attendance (registrar uno)
    @Post('live-classes/:id/attendance')
    registerAttendance(
        @Param('id', ParseUUIDPipe) claseId: string,
        @CurrentUser() user: any,
        @Body() dto: {
            alumno_id: string;
            presente: boolean;
            justificacion?: string;
        },
    ) {
        return this.liveClassesService.registerAttendance({
            clase_vivo_id: claseId,
            alumno_id: dto.alumno_id,
            presente: dto.presente,
            justificacion: dto.justificacion,
            registrado_por: user?.sub ?? 'dev',
        });
    }

    // POST /api/live-classes/:id/attendance/bulk (registrar todos)
    @Post('live-classes/:id/attendance/bulk')
    registerBulkAttendance(
        @Param('id', ParseUUIDPipe) claseId: string,
        @CurrentUser() user: any,
        @Body() dto: {
            alumnos: { alumno_id: string; presente: boolean; justificacion?: string }[];
        },
    ) {
        return this.liveClassesService.registerBulkAttendance({
            clase_vivo_id: claseId,
            registrado_por: user?.sub ?? 'dev',
            alumnos: dto.alumnos,
        });
    }

    // GET /api/attendance/alumno/:alumnoId
    @Get('attendance/alumno/:alumnoId')
    getAttendanceByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query('cursoId') cursoId?: string,
    ) {
        return this.liveClassesService.getAttendanceByAlumno(alumnoId, cursoId);
    }
}