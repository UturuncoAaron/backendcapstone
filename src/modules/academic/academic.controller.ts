import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, Req,
    ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { AcademicService } from './academic.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academic')
export class AcademicController {
    constructor(private readonly academicService: AcademicService) { }

    // ── GRADOS ───────────────────────────────────────────────────

    @Get('grados')
    @Roles('admin', 'docente', 'alumno', 'padre')
    findAllGrados() {
        return this.academicService.findAllGrados();
    }

    @Get('grados/:id')
    @Roles('admin', 'docente')
    findGrado(@Param('id', ParseIntPipe) id: number) {
        return this.academicService.findGradoById(id);
    }

    // ── SECCIONES ────────────────────────────────────────────────

    @Get('secciones')
    @Roles('admin', 'docente')
    findAllSecciones(
        @Query('gradoId', new ParseIntPipe({ optional: true })) gradoId?: number,
    ) {
        return this.academicService.findAllSecciones(gradoId);
    }

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

    @Patch('secciones/:id/tutor')
    @Roles('admin')
    asignarTutor(
        @Param('id', ParseIntPipe) seccionId: number,
        @Body() body: { docente_id: string | null; force?: boolean },
    ) {
        return this.academicService.asignarTutor(
            seccionId,
            body.docente_id ?? null,
            body.force === true,
        );
    }

    @Get('tutoria/me')
    @Roles('docente', 'admin')
    getMiTutoria(@CurrentUser() user: any) {
        return this.academicService.getTutoriaForDocente(user.id);
    }

    // ── PERIODOS ─────────────────────────────────────────────────

    @Get('periodos')
    @Roles('admin', 'docente', 'alumno', 'padre')
    findAllPeriodos() {
        return this.academicService.findAllPeriodos();
    }

    @Get('periodos/activo')
    @Roles('admin', 'docente', 'alumno', 'padre')
    findPeriodoActivo() {
        return this.academicService.findPeriodoActivo();
    }

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

    @Patch('periodos/:id/activar')
    @Roles('admin')
    activarPeriodo(@Param('id', ParseIntPipe) id: number) {
        return this.academicService.activarPeriodo(id);
    }

    // ── MATRÍCULAS ────────────────────────────────────────────────
    @Get('matriculas')
    @Roles('admin')
    findMatriculas(
        @Query('periodo_id', new ParseIntPipe({ optional: true })) periodoId?: number,
        @Query('seccion_id', new ParseIntPipe({ optional: true })) seccionId?: number,
    ) {
        return this.academicService.findMatriculas(periodoId, seccionId);
    }
}