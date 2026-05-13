import {
    Controller, Get, Post, Put, Patch, Delete,
    Param, Body, Query, ParseUUIDPipe,
    UseGuards, HttpCode,
} from '@nestjs/common';
import { GradesService } from './grades.service.js';
import { CreateGradeDto } from './dto/create-grade.dto.js';
import { UpdateGradeDto } from './dto/update-grade.dto.js';
import { BulkGradesDto } from './dto/bulk-grades.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('grades')
export class GradesController {
    constructor(private readonly grades: GradesService) { }

    // GET /api/grades/my?anio=2025
    @Get('my')
    @Roles('alumno')
    getMyGrades(@CurrentUser() user: AuthUser, @Query('anio') anio?: string) {
        return this.grades.getGradesByAlumno(
            user.id, anio ? parseInt(anio, 10) : undefined,
        );
    }

    // GET /api/grades/alumno/:alumnoId?anio=2025
    @Get('alumno/:alumnoId')
    @Roles('docente', 'admin', 'padre')
    getGradesByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
        @Query('anio') anio?: string,
    ) {
        return this.grades.getGradesByAlumnoForUser(
            alumnoId, user, anio ? parseInt(anio, 10) : undefined,
        );
    }

    // GET /api/grades/course/:cursoId?periodoId=<uuid>
    // periodoId es UUID; antes se parseaba como entero y rompia con 400.
    @Get('course/:cursoId')
    @Roles('docente', 'admin')
    getCourseGrid(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Query('periodoId') periodoId?: string,
    ) {
        return this.grades.getCourseGrid(cursoId, user, periodoId);
    }

    // GET /api/grades/course/:cursoId/actividades?periodoId=<uuid>
    @Get('course/:cursoId/actividades')
    @Roles('docente', 'admin')
    getActividades(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Query('periodoId') periodoId?: string,
    ) {
        return this.grades.getActividadesByCourse(cursoId, user, periodoId);
    }

    // GET /api/grades/:id
    @Get(':id')
    @Roles('docente', 'admin', 'padre', 'alumno')
    getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
        return this.grades.getOneFor(id, user);
    }

    // POST /api/grades   (409 si ya existe)
    @Post()
    @Roles('docente', 'admin')
    create(@Body() dto: CreateGradeDto, @CurrentUser() user: AuthUser) {
        return this.grades.create(dto, user);
    }

    // PUT /api/grades/:id
    @Put(':id')
    @Roles('docente', 'admin')
    replace(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateGradeDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.grades.replace(id, dto, user);
    }

    // PATCH /api/grades/:id
    @Patch(':id')
    @Roles('docente', 'admin')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateGradeDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.grades.update(id, dto, user);
    }

    // DELETE /api/grades/:id
    @Delete(':id')
    @HttpCode(204)
    @Roles('docente', 'admin')
    remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
        return this.grades.remove(id, user);
    }

    // POST /api/grades/course/:cursoId/bulk
    @Post('course/:cursoId/bulk')
    @Roles('docente', 'admin')
    bulk(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Body() dto: BulkGradesDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.grades.upsertBulk(cursoId, dto.items, user);
    }
}