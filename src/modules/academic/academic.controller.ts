import {
    Controller, Get, Post, Patch,
    Body, Param, Query,
    ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { AcademicService } from './academic.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academic')
export class AcademicController {
    constructor(private readonly academicService: AcademicService) { }

    // ── GRADOS (solo lectura — datos fijos) ──────────────────────

    // GET /api/academic/grados
    @Get('grados')
    @Roles('admin', 'docente', 'alumno', 'padre')
    findAllGrados() {
        return this.academicService.findAllGrados();
    }

    // GET /api/academic/grados/:id
    @Get('grados/:id')
    @Roles('admin', 'docente')
    findGrado(@Param('id', ParseIntPipe) id: number) {
        return this.academicService.findGradoById(id);
    }

    // ── SECCIONES ────────────────────────────────────────────────

    // GET /api/academic/secciones?gradoId=1
    @Get('secciones')
    @Roles('admin', 'docente')
    findAllSecciones(
        @Query('gradoId', new ParseIntPipe({ optional: true })) gradoId?: number,
    ) {
        return this.academicService.findAllSecciones(gradoId);
    }

    // POST /api/academic/secciones
    @Post('secciones')
    @Roles('admin')
    createSeccion(
        @Body() body: { grado_id: number; nombre: string; capacidad?: number },
    ) {
        return this.academicService.createSeccion(
            Number(body.grado_id),
            body.nombre,
            body.capacidad,
        );
    }

    // PATCH /api/academic/secciones/:id/tutor
    @Patch('secciones/:id/tutor')
    @Roles('admin')
    asignarTutor(
        @Param('id', ParseIntPipe) seccionId: number,
        @Body('tutor_id') tutorId: string,
    ) {
        return this.academicService.asignarTutor(seccionId, tutorId);
    }

    // ── PERIODOS ─────────────────────────────────────────────────

    // GET /api/academic/periodos
    @Get('periodos')
    @Roles('admin', 'docente', 'alumno', 'padre')
    findAllPeriodos() {
        return this.academicService.findAllPeriodos();
    }

    // GET /api/academic/periodos/activo  ← debe ir ANTES de :id
    @Get('periodos/activo')
    @Roles('admin', 'docente', 'alumno', 'padre')
    findPeriodoActivo() {
        return this.academicService.findPeriodoActivo();
    }

    // POST /api/academic/periodos
    @Post('periodos')
    @Roles('admin')
    createPeriodo(
        @Body() body: {
            nombre: string;
            anio: number;
            bimestre: number;
            fecha_inicio: string;
            fecha_fin: string;
        },
    ) {
        return this.academicService.createPeriodo(body);
    }

    // PATCH /api/academic/periodos/:id/activar
    @Patch('periodos/:id/activar')
    @Roles('admin')
    activarPeriodo(@Param('id', ParseIntPipe) id: number) {
        return this.academicService.activarPeriodo(id);
    }
}