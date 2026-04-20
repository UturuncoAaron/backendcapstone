import { Controller, Get, Post, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { GradesService } from './grades.service.js';
import { CreateGradeDto } from './dto/create-grade.dto.js';

// TODO: agregar JwtAuthGuard + Roles cuando se implemente JWT
@Controller('grades')
export class GradesController {
    constructor(private readonly gradesService: GradesService) { }

    // GET /api/grades/my — alumno ve sus notas
    @Get('my')
    getMyGrades() {
        // TODO: reemplazar con CurrentUser cuando JWT esté activo
        const alumnoId = 'd6657bbc-f998-486e-8a54-8a26ddb26cbc';
        return this.gradesService.getMyGrades(alumnoId);
    }

    // GET /api/grades/course/:cursoId — docente ve notas de su curso
    @Get('course/:cursoId')
    getGradesByCourse(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query('bimestre') bimestre?: string,
    ) {
        return this.gradesService.getGradesByCourse(
            cursoId,
            bimestre ? parseInt(bimestre) : undefined,
        );
    }

    // GET /api/grades/alumno/:alumnoId — padre ve notas de su hijo
    @Get('alumno/:alumnoId')
    getGradesByAlumno(@Param('alumnoId', ParseUUIDPipe) alumnoId: string) {
        return this.gradesService.getGradesByAlumno(alumnoId);
    }

    // POST /api/grades — docente registra o actualiza nota
    @Post()
    upsertGrade(@Body() dto: CreateGradeDto) {
        return this.gradesService.upsertGrade(dto);
    }
}