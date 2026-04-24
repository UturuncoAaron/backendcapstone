import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import {
    CreateAlumnoDto,
    CreateDocenteDto,
    CreatePadreDto,
    CreateAdminDto,
    LinkPadreAlumnoDto,
    ResetPasswordDto,
} from './dto/users.dto.js';

@Controller('admin/users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // ── Stats ────────────────────────────────────────────────────
    // GET /api/admin/users/stats
    @Get('stats')
    getStats() {
        return this.usersService.getStats();
    }

    // ── Crear por rol ────────────────────────────────────────────
    // POST /api/admin/users/alumnos
    @Post('alumnos')
    createAlumno(@Body() dto: CreateAlumnoDto) {
        return this.usersService.createAlumno(dto);
    }

    // POST /api/admin/users/docentes
    @Post('docentes')
    createDocente(@Body() dto: CreateDocenteDto) {
        return this.usersService.createDocente(dto);
    }

    // POST /api/admin/users/padres
    @Post('padres')
    createPadre(@Body() dto: CreatePadreDto) {
        return this.usersService.createPadre(dto);
    }

    // POST /api/admin/users/admins
    @Post('admins')
    createAdmin(@Body() dto: CreateAdminDto) {
        return this.usersService.createAdmin(dto);
    }

    // ── Listar ───────────────────────────────────────────────────
    // GET /api/admin/users/alumnos
    @Get('alumnos')
    findAlumnos() {
        return this.usersService.findAlumnos();
    }

    // GET /api/admin/users/docentes
    @Get('docentes')
    findDocentes() {
        return this.usersService.findDocentes();
    }

    // GET /api/admin/users/padres
    @Get('padres')
    findPadres() {
        return this.usersService.findPadres();
    }

    // ── Buscar (autocomplete) ────────────────────────────────────
    // GET /api/admin/users/alumnos/search?q=garcia
    @Get('alumnos/search')
    searchAlumnos(@Query('q') q: string) {
        return this.usersService.searchAlumnos(q);
    }

    // GET /api/admin/users/docentes/search?q=torres
    @Get('docentes/search')
    searchDocentes(@Query('q') q: string) {
        return this.usersService.searchDocentes(q);
    }

    // ── Obtener uno ──────────────────────────────────────────────
    // GET /api/admin/users/alumnos/:id
    @Get('alumnos/:id')
    findAlumno(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findAlumnoById(id);
    }

    // GET /api/admin/users/docentes/:id
    @Get('docentes/:id')
    findDocente(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findDocenteById(id);
    }

    // ── Desactivar ───────────────────────────────────────────────
    // DELETE /api/admin/users/:id
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    deactivate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.deactivate(id);
    }

    // ── Reset password ───────────────────────────────────────────
    // PATCH /api/admin/users/:id/reset-password
    @Patch(':id/reset-password')
    resetPassword(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ResetPasswordDto,
    ) {
        return this.usersService.resetPassword(id, dto.password);
    }

    // ── Vincular padre ↔ alumno ──────────────────────────────────
    // POST /api/admin/users/parent-child
    @Post('parent-child')
    linkPadreAlumno(@Body() dto: LinkPadreAlumnoDto) {
        return this.usersService.linkPadreAlumno(dto);
    }
}