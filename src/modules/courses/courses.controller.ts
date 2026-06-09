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

    @Get('colors')
    @Roles('admin', 'docente', 'staff')
    getCourseColors() {
        return this.coursesService.getAvailableColors();
    }

    @Get('areas')
    @Roles('admin', 'docente', 'staff')
    getCourseAreas() {
        return this.coursesService.getAvailableAreas();
    }

    @Get('catalog')
    @Roles('admin', 'docente', 'staff')
    getCatalog() {
        return this.coursesService.findCatalog();
    }

    @Post('catalog')
    @Roles('admin', 'staff', 'docente')
    createCatalogItem(@Body() dto: { nombre: string; area?: string; color?: string }) {
        return this.coursesService.createCatalogItem(dto);
    }

    @Patch('catalog/:id')
    @Roles('admin', 'staff', 'docente')
    updateCatalogItem(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: { nombre?: string; area?: string; color?: string; activo?: boolean },
    ) {
        return this.coursesService.updateCatalogItem(id, dto);
    }

    @Get()
    @Roles('alumno', 'docente', 'admin', 'staff')
    findMyCourses(
        @CurrentUser() user: AuthUser,
        @Query('seccion_id') seccionId?: string,
        @Query('anio') anio?: string,
    ) {
        return this.coursesService.findMyCourses(
            user.id, user.rol, seccionId, anio ? +anio : undefined,
        );
    }

    @Post()
    @Roles('admin', 'staff', 'docente')
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

    @Post('enroll')
    @Roles('admin', 'staff', 'docente')
    enroll(@Body() dto: { alumnoId: string; seccionId: string; anio: number }) {
        return this.coursesService.enrollStudent(dto.alumnoId, dto.seccionId, dto.anio);
    }

    @Delete('enroll/:id')
    @Roles('admin', 'staff', 'docente')
    unenroll(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.unenrollStudent(id);
    }

    @Get('seccion/:id/students')
    @Roles('alumno', 'docente', 'admin', 'staff')
    getStudents(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.coursesService.getEnrollmentsBySeccion(id, user);
    }

    @Get(':id')
    @Roles('alumno', 'docente', 'admin', 'staff')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.coursesService.findOne(id);
    }

    @Get(':id/progress')
    @Roles('alumno')
    getProgress(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.materialsService.getCourseProgress(id, user.id);
    }

    @Patch(':id')
    @Roles('docente', 'admin', 'staff')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: { descripcion?: string; activo?: boolean; color?: string },
    ) {
        return this.coursesService.update(id, user.id, user.rol, dto);
    }

    @Patch(':id/assign-teacher')
    @Roles('admin', 'staff', 'docente')
    assignTeacher(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignTeacherDto,
    ) {
        return this.coursesService.assignTeacher(id, dto.docente_id);
    }
}