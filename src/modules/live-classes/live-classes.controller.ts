import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { LiveClassesService } from './live-classes.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { EstadoClase } from './entities/live-class.entity.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller()
export class LiveClassesController {
    constructor(private readonly liveClassesService: LiveClassesService) { }

    // ── CLASES EN VIVO ──────────────────────────────────────────

    // GET /api/live-classes  (lista global, opcionalmente filtrada por cursoId)
    @Get('live-classes')
    findAll(@Query('cursoId') cursoId?: string) {
        return cursoId
            ? this.liveClassesService.findByCourse(cursoId)
            : this.liveClassesService.findAll();
    }

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

    // POST /api/live-classes  (alterno: curso_id en body)
    @Post('live-classes')
    createGlobal(
        @Body() dto: {
            curso_id: string;
            titulo: string;
            descripcion?: string;
            fecha_hora: string;
            duracion_min?: number;
            link_reunion: string;
        },
    ) {
        return this.liveClassesService.create({
            ...dto,
            fecha_hora: new Date(dto.fecha_hora),
        });
    }

    // PATCH /api/live-classes/:id
    @Patch('live-classes/:id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
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
            user?.id ?? 'dev',
            user?.rol ?? 'admin',
        );
    }

    // PATCH /api/live-classes/:id/status
    @Patch('live-classes/:id/status')
    updateEstado(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: { estado: EstadoClase },
    ) {
        return this.liveClassesService.updateEstado(
            id, dto.estado,
            user?.id ?? 'dev',
            user?.rol ?? 'admin',
        );
    }

    // DELETE /api/live-classes/:id
    @Delete('live-classes/:id')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.liveClassesService.remove(
            id,
            user?.id ?? 'dev',
            user?.rol ?? 'admin',
        );
    }
}