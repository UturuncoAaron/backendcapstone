import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service.js';
import { MaterialsService } from '../materials/materials.service.js';
import { AssignTeacherDto } from './dto/assign-teacher.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
    constructor(
        private readonly coursesService: CoursesService,
        private readonly materialsService: MaterialsService,
    ) { }

    // GET /api/courses/colors
    @Get('colors')
    @Roles('admin', 'docente')
    getCourseColors() {
        return this.coursesService.getAvailableColors();
    }

    // GET /api/courses/catalog
    @Get('catalog')
    @Roles('admin', 'docente')
    getCatalog() {
        return this.coursesService.findCatalog();
    }

    // POST /api/courses/catalog
    @Post('catalog')
    @Roles('admin')
    createCatalogItem(@Body() dto: { nombre: string; area?: string; color?: string }) {
        return this.coursesService.createCatalogItem(dto);
    }

    // PATCH /api/courses/catalog/:id
    @Patch('catalog/:id')
    @Roles('admin')
    updateCatalogItem(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: { nombre?: string; area?: string; color?: string; activo?: boolean },
    ) {
        return this.coursesService.updateCatalogItem(id, dto);
    }

    // GET /api/courses
    @Get()
    @Roles('alumno', 'docente', 'admin')
    findMyCourses(
        @CurrentUser() user: AuthUser,
        @Query('seccion_id') seccionId?: string,
        @Query('anio') anio?: string,
    ) {
        return this.coursesService.findMyCourses(
            user.id, user.rol, seccionId, anio ? +anio : undefined,
        );
    }

    // POST /api/courses
    @Post()
    @Roles('admin')
    create(@Body() dto: {
        catalogo_id: string;
        descripcion?: string;
        docente_id?: string;
        seccion_id: string;
        anio: number;
        color?: string;
    }) {
        return this.coursesService.create(dto);
    }

    // POST /api/courses/enroll
    @Post('enroll')
    @Roles('admin')
    enroll(@Body() dto: { alumnoId: string; seccionId: string; anio: number }) {
        return this.coursesService.enrollStudent(dto.alumnoId, dto.seccionId, dto.anio);
    }

    // DELETE /api/courses/enroll/:id
    @Delete('enroll/:id')
    @Roles('admin')
    unenroll(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.unenrollStudent(id);
    }

    // GET /api/courses/seccion/:id/students
    @Get('seccion/:id/students')
    @Roles('alumno', 'docente', 'admin')
    getStudents(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.coursesService.getEnrollmentsBySeccion(id, user);
    }

    // GET /api/courses/:id
    @Get(':id')
    @Roles('alumno', 'docente', 'admin')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.findOne(id);
    }

    // GET /api/courses/:id/progress
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
        @Body() dto: { descripcion?: string; activo?: boolean; color?: string },
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