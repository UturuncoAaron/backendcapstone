import {
    Controller, Get, Post, Patch,
    Body, Param, ParseUUIDPipe, ParseIntPipe,
} from '@nestjs/common';
import { CoursesService } from './courses.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('courses')
export class CoursesController {
    constructor(private readonly coursesService: CoursesService) { }

    // GET /api/courses — mis cursos según rol
    @Get()
    findMyCourses(@CurrentUser() user: any) {
        // En desarrollo user puede ser undefined — usamos fallback
        const userId = user?.sub ?? 'dev';
        const rol = user?.rol ?? 'admin';
        return this.coursesService.findMyCourses(userId, rol);
    }

    // GET /api/courses/:id
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.findOne(id);
    }

    // POST /api/courses — admin crea curso
    @Post()
    create(@Body() dto: {
        nombre: string;
        descripcion?: string;
        docente_id: string;
        seccion_id: number;
        periodo_id: number;
    }) {
        return this.coursesService.create(dto);
    }

    // PATCH /api/courses/:id
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: { nombre?: string; descripcion?: string },
    ) {
        return this.coursesService.update(id, user?.sub ?? 'dev', user?.rol ?? 'admin', dto);
    }

    // POST /api/courses/enroll — admin matricula alumno
    @Post('enroll')
    enroll(@Body() dto: { alumnoId: string; seccionId: number; periodoId: number }) {
        return this.coursesService.enrollStudent(dto.alumnoId, dto.seccionId, dto.periodoId);
    }

    // GET /api/courses/seccion/:id/students
    @Get('seccion/:id/students')
    getStudents(@Param('id', ParseIntPipe) id: number) {
        return this.coursesService.getEnrollmentsBySeccion(id);
    }
}