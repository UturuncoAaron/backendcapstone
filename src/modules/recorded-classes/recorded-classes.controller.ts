import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe,
    HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { RecordedClassesService } from './recorded-classes.service.js';
import { CreateRecordedClassDto, UpdateRecordedClassDto, ToggleRecordedClassDto } from './dto/recorded-classes.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses/:courseId/recorded-classes')
export class RecordedClassesController {
    constructor(private readonly service: RecordedClassesService) { }

    @Get()
    @Roles('alumno', 'docente', 'admin', 'padre')
    findAll(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: AuthUser,
    ) {
        const cuentaId = ['alumno', 'padre'].includes(user?.rol) ? user.id : undefined;
        return this.service.findByCourse(courseId, cuentaId);
    }

    @Get(':id')
    @Roles('alumno', 'docente', 'admin', 'padre')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.findOne(id);
    }

    @Get(':id/stats')
    @Roles('docente', 'admin')
    getStats(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.getViewStats(id);
    }

    @Post()
    @Roles('docente', 'admin')
    create(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: CreateRecordedClassDto,
    ) {
        return this.service.create(courseId, dto);
    }

    @Post(':id/view')
    @Roles('alumno', 'padre')
    @HttpCode(HttpStatus.OK)
    registerView(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.registerView(id, user.id);
    }

    @Patch(':id/toggle')
    @Roles('docente', 'admin')
    toggle(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ToggleRecordedClassDto,
    ) {
        return this.service.toggle(id, dto);
    }

    @Patch(':id')
    @Roles('docente', 'admin')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateRecordedClassDto,
    ) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @Roles('docente', 'admin')
    @HttpCode(HttpStatus.OK)
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.remove(id);
    }
}