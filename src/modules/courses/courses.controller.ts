import {
    Controller, Get, Post, Patch,
    Body, Param, ParseUUIDPipe, ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service.js';
import { AssignTeacherDto } from './dto/assign-teacher.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
    constructor(private readonly coursesService: CoursesService) { }

    // GET /api/courses — cursos del usuario según su rol
    @Get()
    @Roles('alumno', 'docente', 'admin')
    findMyCourses(@CurrentUser() user: any) {
        return this.coursesService.findMyCourses(user.sub, user.rol);
    }

    // POST /api/courses — admin crea curso manualmente
    @Post()
    @Roles('admin')
    create(@Body() dto: {
        nombre: string;
        descripcion?: string;
        docente_id?: string;
        seccion_id: number;
        periodo_id: number;
        color?: string;
    }) {
        return this.coursesService.create(dto);
    }

    // POST /api/courses/enroll — matricular alumno
    @Post('enroll')
    @Roles('admin')
    enroll(@Body() dto: { alumnoId: string; seccionId: number; periodoId: number }) {
        return this.coursesService.enrollStudent(dto.alumnoId, dto.seccionId, dto.periodoId);
    }

    // POST /api/courses/generate/:seccionId/:periodoId — generar cursos desde plantilla
    @Post('generate/:seccionId/:periodoId')
    @Roles('admin')
    generateFromTemplate(
        @Param('seccionId', ParseIntPipe) seccionId: number,
        @Param('periodoId', ParseIntPipe) periodoId: number,
    ) {
        return this.coursesService.generateCoursesFromTemplate(seccionId, periodoId);
    }

    // GET /api/courses/seccion/:id/students
    @Get('seccion/:id/students')
    @Roles('admin', 'docente')
    getStudents(@Param('id', ParseIntPipe) id: number) {
        return this.coursesService.getEnrollmentsBySeccion(id);
    }

    // GET /api/courses/:id
    @Get(':id')
    @Roles('alumno', 'docente', 'admin')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.findOne(id);
    }

    // PATCH /api/courses/:id
    @Patch(':id')
    @Roles('docente', 'admin')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: { nombre?: string; descripcion?: string },
    ) {
        return this.coursesService.update(id, user.sub, user.rol, dto);
    }

    // PATCH /api/courses/:id/assign-teacher
    @Patch(':id/assign-teacher')
    @Roles('admin')
    assignTeacher(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignTeacherDto,
    ) {
        return this.coursesService.assignTeacher(id, dto.docente_id);
    }
}