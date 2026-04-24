import {
    Controller, Get, Post, Param, Body,
    Query, ParseUUIDPipe, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { GradesService } from './grades.service.js';
import { CreateGradeDto } from './dto/create-grade.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('grades')
export class GradesController {
    constructor(private readonly gradesService: GradesService) { }

    // ── Alumno: ver sus propias notas ────────────────────────────
    // GET /api/grades/my
    @Get('my')
    @Roles('alumno')
    getMyGrades(@CurrentUser() user: any) {
        return this.gradesService.getMyGrades(user.sub);
    }

    // ── Docente/Admin: ver notas de un curso ─────────────────────
    // GET /api/grades/course/:cursoId?periodoId=1
    @Get('course/:cursoId')
    @Roles('docente', 'admin')
    getGradesByCourse(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query('periodoId') periodoId?: string,
    ) {
        return this.gradesService.getGradesByCourse(
            cursoId,
            periodoId ? parseInt(periodoId) : undefined,
        );
    }

    // ── Docente/Admin: ver notas de un alumno ────────────────────
    // GET /api/grades/alumno/:alumnoId
    @Get('alumno/:alumnoId')
    @Roles('docente', 'admin')
    getGradesByAlumno(@Param('alumnoId', ParseUUIDPipe) alumnoId: string) {
        return this.gradesService.getGradesByAlumno(alumnoId);
    }

    // ── Docente: registrar o actualizar nota ─────────────────────
    // POST /api/grades
    @Post()
    @Roles('docente', 'admin')
    upsertGrade(@Body() dto: CreateGradeDto) {
        return this.gradesService.upsertGrade(dto);
    }
}