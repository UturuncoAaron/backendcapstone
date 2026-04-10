import {
    Controller, Get, Post, Patch,
    Body, Param, Query, ParseIntPipe,
} from '@nestjs/common';
import { AcademicService } from './academic.service.js';

@Controller('academic')
export class AcademicController {
    constructor(private readonly academicService: AcademicService) { }

    // ── GRADOS ──────────────────────────────────────────────────────

    // GET /api/academic/grados
    @Get('grados')
    findAllGrados() {
        return this.academicService.findAllGrados();
    }

    // GET /api/academic/grados/:id
    @Get('grados/:id')
    findGrado(@Param('id', ParseIntPipe) id: number) {
        return this.academicService.findGradoById(id);
    }

    // ── SECCIONES ───────────────────────────────────────────────────

    // GET /api/academic/secciones
    // GET /api/academic/secciones?gradoId=1
    @Get('secciones')
    findAllSecciones(@Query('gradoId', new ParseIntPipe({ optional: true })) gradoId?: number) {
        return this.academicService.findAllSecciones(gradoId);
    }

    // POST /api/academic/secciones
    @Post('secciones')
    createSeccion(@Body() body: { gradoId: number; nombre: string; capacidad?: number }) {
        return this.academicService.createSeccion(body.gradoId, body.nombre, body.capacidad);
    }

    // ── PERIODOS ────────────────────────────────────────────────────

    // GET /api/academic/periodos
    @Get('periodos')
    findAllPeriodos() {
        return this.academicService.findAllPeriodos();
    }

    // GET /api/academic/periodos/activo
    @Get('periodos/activo')
    findPeriodoActivo() {
        return this.academicService.findPeriodoActivo();
    }

    // POST /api/academic/periodos
    @Post('periodos')
    createPeriodo(@Body() body: {
        nombre: string;
        anio: number;
        bimestre: number;
        fecha_inicio: string;
        fecha_fin: string;
    }) {
        return this.academicService.createPeriodo(body);
    }

    // PATCH /api/academic/periodos/:id/activar
    @Patch('periodos/:id/activar')
    activarPeriodo(@Param('id', ParseIntPipe) id: number) {
        return this.academicService.activarPeriodo(id);
    }
}