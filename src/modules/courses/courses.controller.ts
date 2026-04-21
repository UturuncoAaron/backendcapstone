import {
    Controller, Get, Post, Patch,
    Body, Param, ParseUUIDPipe, ParseIntPipe,
} from '@nestjs/common';
import { CoursesService } from './courses.service.js';
import { AssignTeacherDto } from './dto/assign-teacher.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// TODO: agregar JwtAuthGuard + Roles cuando se implemente JWT
@Controller('courses')
export class CoursesController {
    constructor(private readonly coursesService: CoursesService) { }

    // GET /api/courses — mis cursos según rol
    @Get()
    findMyCourses(@CurrentUser() user: any) {
        const userId = user?.sub ?? 'dev';
        const rol = user?.rol ?? 'admin';
        return this.coursesService.findMyCourses(userId, rol);
    }

    // GET /api/courses/:id
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.findOne(id);
    }

    // POST /api/courses — admin crea curso manualmente
    @Post()
    create(@Body() dto: {
        nombre: string;
        descripcion?: string;
        docente_id: string;
        seccion_id: number;
        periodo_id: number;
        color?: string;
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

    // PATCH /api/courses/:id/assign-teacher — asignar docente a curso
    @Patch(':id/assign-teacher')
    assignTeacher(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignTeacherDto,
    ) {
        return this.coursesService.assignTeacher(id, dto.docente_id);
    }

    // POST /api/courses/generate/:seccionId/:periodoId — generar cursos desde plantilla CNEB
    @Post('generate/:seccionId/:periodoId')
    generateFromTemplate(
        @Param('seccionId', ParseIntPipe) seccionId: number,
        @Param('periodoId', ParseIntPipe) periodoId: number,
    ) {
        return this.coursesService.generateCoursesFromTemplate(seccionId, periodoId);
    }

    // POST /api/courses/enroll — matricular alumno en sección
    @Post('enroll')
    enroll(@Body() dto: { alumnoId: string; seccionId: number; periodoId: number }) {
        return this.coursesService.enrollStudent(dto.alumnoId, dto.seccionId, dto.periodoId);
    }

    // GET /api/courses/seccion/:id/students — alumnos de una sección
    @Get('seccion/:id/students')
    getStudents(@Param('id', ParseIntPipe) id: number) {
        return this.coursesService.getEnrollmentsBySeccion(id);
    }
}