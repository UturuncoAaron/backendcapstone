import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe, ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service.js';
import { MaterialsService } from '../materials/materials.service.js';
import { AssignTeacherDto } from './dto/assign-teacher.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

interface AuthUser { id: string; rol: string; }

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
    constructor(
        private readonly coursesService: CoursesService,
        private readonly materialsService: MaterialsService,
    ) { }

    // GET /api/courses
    @Get()
    @Roles('alumno', 'docente', 'admin')
    findMyCourses(
        @CurrentUser() user: AuthUser,
        @Query('seccion_id') seccionId?: string,
    ) {
        return this.coursesService.findMyCourses(user.id, user.rol, seccionId);
    }

    // POST /api/courses
    @Post()
    @Roles('admin')
    create(@Body() dto: {
        nombre: string;
        descripcion?: string;
        docente_id?: string;
        seccion_id: string;
        periodo_id: number;
        color?: string;
    }) {
        return this.coursesService.create(dto);
    }

    // POST /api/courses/enroll
    @Post('enroll')
    @Roles('admin')
    enroll(@Body() dto: { alumnoId: string; seccionId: string; periodoId: number }) {
        return this.coursesService.enrollStudent(dto.alumnoId, dto.seccionId, dto.periodoId);
    }

    // DELETE /api/courses/enroll/:id — retirar alumno de sección
    @Delete('enroll/:id')
    @Roles('admin')
    unenroll(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.unenrollStudent(id);
    }

    // POST /api/courses/generate/:seccionId/:periodoId
    @Post('generate/:seccionId/:periodoId')
    @Roles('admin')
    generateFromTemplate(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @Param('periodoId', ParseIntPipe) periodoId: number,
    ) {
        return this.coursesService.generateCoursesFromTemplate(seccionId, periodoId);
    }

    // GET /api/courses/seccion/:id/students
    @Get('seccion/:id/students')
    @Roles('admin', 'docente')
    getStudents(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.getEnrollmentsBySeccion(id);
    }

    // GET /api/courses/:id
    @Get(':id')
    @Roles('alumno', 'docente', 'admin')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.findOne(id);
    }

    // GET /api/courses/:id/progress (alumno)
    @Get(':id/progress')
    @Roles('alumno')
    getProgress(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.materialsService.getCourseProgress(id, user.id);
    }

    // PATCH /api/courses/:id
    @Patch(':id')
    @Roles('docente', 'admin')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: { nombre?: string; descripcion?: string; activo?: boolean },
    ) {
        return this.coursesService.update(id, user.id, user.rol, dto);
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