import {
    Controller, Get, Post, Put, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe,
    HttpCode, HttpStatus, UseGuards, NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import {
    CreateAlumnoDto,
    CreateDocenteDto,
    CreatePadreDto,
    CreateAdminDto,
    CreatePsicologaDto,
    LinkPadreAlumnoDto,
    ResetPasswordDto,
} from './dto/users.dto.js';
import { UpdateFullDto } from './dto/profile.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }



    // ── Listar ───────────────────────────────────────────────────────────
    @Get('admins')
    findAdmins() {
        return this.usersService.findAdmins();
    }

    @Get('alumnos')
    findAlumnos() {
        return this.usersService.findAlumnos();
    }

    @Get('docentes')
    findDocentes(@Query('include') include?: string) {
        return this.usersService.findDocentes(include === 'tutoria');
    }

    @Get('padres')
    findPadres() {
        return this.usersService.findPadres();
    }

    @Get('psicologos')
    findPsicologas() {
        return this.usersService.findPsicologas();
    }

    // ── Buscar (autocomplete) ─────────────────────────────────────────────
    // IMPORTANTE: estas rutas deben estar ANTES de /:id para evitar conflictos
    @Get('alumnos/search')
    searchAlumnos(@Query('q') q: string) {
        return this.usersService.searchAlumnos(q);
    }

    @Get('padres/search')
    searchPadres(@Query('q') q: string) {
        return this.usersService.searchPadres(q);
    }

    @Get('docentes/search')
    searchDocentes(@Query('q') q: string) {
        return this.usersService.searchDocentes(q);
    }

    // ── Obtener uno por id ────────────────────────────────────────────────
    @Get('alumnos/:id')
    findAlumno(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findAlumnoById(id);
    }

    @Get('docentes/:id')
    findDocente(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findDocenteById(id);
    }

    @Get('padres/:id')
    findPadre(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findPadreById(id);
    }

    @Get('admins/:id')
    findAdmin(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findAdminById(id);
    }

    @Get('psicologos/:id')
    findPsicologa(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findPsicologaById(id);
    }

    // ── Crear por rol ─────────────────────────────────────────────────────
    @Post('alumnos')
    createAlumno(@Body() dto: CreateAlumnoDto) {
        return this.usersService.createAlumno(dto);
    }

    @Post('docentes')
    createDocente(@Body() dto: CreateDocenteDto) {
        return this.usersService.createDocente(dto);
    }

    @Post('padres')
    createPadre(@Body() dto: CreatePadreDto) {
        return this.usersService.createPadre(dto);
    }

    @Post('admins')
    createAdmin(@Body() dto: CreateAdminDto) {
        return this.usersService.createAdmin(dto);
    }

    @Post('psicologos')
    createPsicologa(@Body() dto: CreatePsicologaDto) {
        return this.usersService.createPsicologa(dto);
    }

    // ── PUT unificado ─────────────────────────────────────────────────────

    @Put(':id')
    async updateUser(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateFullDto,
    ) {
        const cuenta = await this.usersService.findCuentaById(id);
        if (!cuenta) throw new NotFoundException(`Usuario ${id} no encontrado`);
        return this.usersService.updateFull(id, cuenta.rol, dto, false);
    }

    // ── Desactivar / Reactivar ────────────────────────────────────────────
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    deactivate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.deactivate(id);
    }

    @Patch(':id/reactivar')
    @HttpCode(HttpStatus.OK)
    reactivate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.reactivate(id);
    }

    // ── Reset password ────────────────────────────────────────────────────
    @Patch(':id/reset-password')
    resetPassword(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() _dto: ResetPasswordDto,
    ) {
        return this.usersService.resetPassword(id);
    }

    // ── Vincular padre ↔ alumno ───────────────────────────────────────────
    @Post('parent-child')
    linkPadreAlumno(@Body() dto: LinkPadreAlumnoDto) {
        return this.usersService.linkPadreAlumno(dto);
    }
}