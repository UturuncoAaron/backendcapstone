import {
    Controller, Get, Post, Param, Body,
    Query, ParseUUIDPipe, UseGuards,
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

    // Alumno: ver sus propias notas
    // GET /api/grades/my
    @Get('my')
    @Roles('alumno')
    getMyGrades(@CurrentUser() user: any) {
        return this.gradesService.getMyGrades(user.sub);
    }

    // Docente: ver actividades (títulos) registradas en un curso
    // GET /api/grades/course/:cursoId/actividades?periodoId=1
    @Get('course/:cursoId/actividades')
    @Roles('docente', 'admin')
    getActividades(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query('periodoId') periodoId?: string,
    ) {
        return this.gradesService.getActividadesByCourse(
            cursoId,
            periodoId ? parseInt(periodoId) : undefined,
        );
    }

    // Docente: lista de alumnos con su nota para una actividad
    // GET /api/grades/course/:cursoId?periodoId=1&titulo=Examen Parcial
    // Sin titulo → notas finales del bimestre
    @Get('course/:cursoId')
    @Roles('docente', 'admin')
    getGradesByCourse(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query('periodoId') periodoId?: string,
        @Query('titulo') titulo?: string,
    ) {
        return this.gradesService.getGradesByCourse(
            cursoId,
            periodoId ? parseInt(periodoId) : undefined,
            titulo,
        );
    }

    // Padre/Admin/Docente: todas las notas de un alumno
    // GET /api/grades/alumno/:alumnoId
    @Get('alumno/:alumnoId')
    @Roles('docente', 'admin', 'padre')
    getGradesByAlumno(@Param('alumnoId', ParseUUIDPipe) alumnoId: string) {
        return this.gradesService.getGradesByAlumno(alumnoId);
    }

    // Docente: registrar o actualizar una nota
    // POST /api/grades
    @Post()
    @Roles('docente', 'admin')
    upsertGrade(@Body() dto: CreateGradeDto) {
        return this.gradesService.upsertGrade(dto);
    }

    // Docente: guardar notas de todo el salón de una vez
    // POST /api/grades/bulk
    @Post('bulk')
    @Roles('docente', 'admin')
    upsertBulk(@Body() dtos: CreateGradeDto[]) {
        if (!Array.isArray(dtos) || dtos.length === 0) {
            return { guardadas: 0, errores: [] };
        }
        return this.gradesService.upsertBulk(dtos);
    }
}