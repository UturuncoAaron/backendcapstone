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

    // ══════════════════════════════════════════════════════════════
    // LISTAR CON PAGINACIÓN
    // ══════════════════════════════════════════════════════════════

    @Get('admins')
    findAdmins(
        @Query('q') q?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.usersService.findAdmins({
            q,
            page: Math.max(1, parseInt(page)),
            limit: Math.min(100, parseInt(limit)),
        });
    }

    @Get('alumnos')
    findAlumnos(
        @Query('q') q?: string,
        @Query('grado_id') gradoId?: string,
        @Query('seccion_id') seccionId?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.usersService.findAlumnos({
            q, gradoId, seccionId,
            page: Math.max(1, parseInt(page)),
            limit: Math.min(100, parseInt(limit)),
        });
    }

    @Get('docentes')
    findDocentes(
        @Query('q') q?: string,
        @Query('include') include?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.usersService.findDocentes({
            q,
            includeTutoria: include === 'tutoria',
            page: Math.max(1, parseInt(page)),
            limit: Math.min(100, parseInt(limit)),
        });
    }

    @Get('padres')
    findPadres(
        @Query('q') q?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.usersService.findPadres({
            q,
            page: Math.max(1, parseInt(page)),
            limit: Math.min(100, parseInt(limit)),
        });
    }

    @Get('psicologos')
    findPsicologas(
        @Query('q') q?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.usersService.findPsicologas({
            q,
            page: Math.max(1, parseInt(page)),
            limit: Math.min(100, parseInt(limit)),
        });
    }

    // ══════════════════════════════════════════════════════════════
    // BÚSQUEDA AUTOCOMPLETE
    // IMPORTANTE: rutas con sufijo ANTES de /:id
    // ══════════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════════
    // OBTENER UNO POR ID
    // ══════════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════════
    // CREAR INDIVIDUAL
    // ══════════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════════
    // CREAR MASIVO (seed/testing — borrar en producción)
    // ══════════════════════════════════════════════════════════════

    @Post('alumnos/bulk')
    async createAlumnosBulk(@Body() dtos: CreateAlumnoDto[]) {
        return this.usersService.createBulk('alumno', dtos);
    }

    @Post('docentes/bulk')
    async createDocentesBulk(@Body() dtos: CreateDocenteDto[]) {
        return this.usersService.createBulk('docente', dtos);
    }

    @Post('padres/bulk')
    async createPadresBulk(@Body() dtos: CreatePadreDto[]) {
        return this.usersService.createBulk('padre', dtos);
    }

    @Post('admins/bulk')
    async createAdminsBulk(@Body() dtos: CreateAdminDto[]) {
        return this.usersService.createBulk('admin', dtos);
    }

    @Post('psicologos/bulk')
    async createPsicologasBulk(@Body() dtos: CreatePsicologaDto[]) {
        return this.usersService.createBulk('psicologa', dtos);
    }

    // ══════════════════════════════════════════════════════════════
    // ACTUALIZAR
    // ══════════════════════════════════════════════════════════════

    @Put(':id')
    async updateUser(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateFullDto,
    ) {
        const cuenta = await this.usersService.findCuentaById(id);
        if (!cuenta) throw new NotFoundException(`Usuario ${id} no encontrado`);
        return this.usersService.updateFull(id, cuenta.rol, dto, false);
    }

    // ══════════════════════════════════════════════════════════════
    // ACTIVAR / DESACTIVAR
    // ══════════════════════════════════════════════════════════════

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

    // ══════════════════════════════════════════════════════════════
    // RESET PASSWORD
    // ══════════════════════════════════════════════════════════════

    @Patch(':id/reset-password')
    resetPassword(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() _dto: ResetPasswordDto,
    ) {
        return this.usersService.resetPassword(id);
    }

    // ══════════════════════════════════════════════════════════════
    // VÍNCULO PADRE ↔ ALUMNO
    // ══════════════════════════════════════════════════════════════

    @Post('parent-child')
    linkPadreAlumno(@Body() dto: LinkPadreAlumnoDto) {
        return this.usersService.linkPadreAlumno(dto);
    }
}