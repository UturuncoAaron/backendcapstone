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
    CreateStaffDto,
    LinkPadreAlumnoDto,
    ResetPasswordDto,
} from './dto/users.dto.js';
import { UpdateFullDto } from './dto/profile.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff', 'docente')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('admins')
    @Roles('admin')
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
    @Roles('admin', 'staff', 'psicologa', 'docente')
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
    @Roles('admin', 'staff', 'docente')
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
    @Roles('admin', 'staff', 'docente')
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
    @Roles('admin', 'staff', 'docente')
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

    @Get('staff')
    @Roles('admin', 'staff', 'docente')
    findStaff(
        @Query('q') q?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.usersService.findStaff({
            q,
            page: Math.max(1, parseInt(page)),
            limit: Math.min(100, parseInt(limit)),
        });
    }

    @Get('alumnos/search')
    @Roles('admin', 'staff', 'psicologa', 'docente')
    searchAlumnos(
        @Query('q') q: string,
        @Query('anio') anio?: string,
        @Query('incluir_matriculados') incluirMatriculados?: string,
    ) {
        return this.usersService.searchAlumnos(
            q,
            anio ? parseInt(anio, 10) : undefined,
            incluirMatriculados === 'true' || incluirMatriculados === '1',
        );
    }

    @Get('padres/search')
    @Roles('admin', 'staff', 'docente')
    searchPadres(@Query('q') q: string) {
        return this.usersService.searchPadres(q);
    }

    @Get('docentes/search')
    @Roles('admin', 'staff', 'docente')
    searchDocentes(@Query('q') q: string) {
        return this.usersService.searchDocentes(q);
    }

    @Get('docentes/select')
    @Roles('admin', 'staff', 'docente')
    findDocentesForSelect(@Query('include') include?: string) {
        return this.usersService.findDocentesForSelect(include === 'tutoria');
    }

    @Get('staff/search')
    @Roles('admin', 'staff', 'docente')
    searchStaff(@Query('q') q: string) {
        return this.usersService.searchStaff(q);
    }

    @Get('alumnos/:id')
    @Roles('admin', 'staff', 'psicologa', 'docente')
    findAlumno(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findAlumnoById(id);
    }

    @Get('docentes/:id')
    @Roles('admin', 'staff', 'docente')
    findDocente(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findDocenteById(id);
    }

    @Get('padres/:id')
    @Roles('admin', 'staff', 'docente')
    findPadre(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findPadreById(id);
    }

    @Get('admins/:id')
    @Roles('admin')
    findAdmin(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findAdminById(id);
    }

    @Get('psicologos/:id')
    @Roles('admin', 'staff', 'docente')
    findPsicologa(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findPsicologaById(id);
    }

    @Get('staff/:id')
    @Roles('admin', 'staff', 'docente')
    findStaffById(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findStaffById(id);
    }

    @Post('alumnos')
    @Roles('admin', 'staff', 'docente')
    createAlumno(@Body() dto: CreateAlumnoDto) {
        return this.usersService.createAlumno(dto);
    }

    @Post('docentes')
    @Roles('admin', 'staff', 'docente')
    createDocente(@Body() dto: CreateDocenteDto) {
        return this.usersService.createDocente(dto);
    }

    @Post('padres')
    @Roles('admin', 'staff', 'docente')
    createPadre(@Body() dto: CreatePadreDto) {
        return this.usersService.createPadre(dto);
    }

    @Post('admins')
    @Roles('admin')
    createAdmin(@Body() dto: CreateAdminDto) {
        return this.usersService.createAdmin(dto);
    }

    @Post('psicologos')
    @Roles('admin', 'staff', 'docente')
    createPsicologa(@Body() dto: CreatePsicologaDto) {
        return this.usersService.createPsicologa(dto);
    }

    @Post('staff')
    @Roles('admin', 'staff', 'docente')
    createStaff(@Body() dto: CreateStaffDto) {
        return this.usersService.createStaff(dto);
    }

    @Put(':id')
    @Roles('admin', 'staff', 'docente')
    async updateUser(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateFullDto,
    ) {
        const cuenta = await this.usersService.findCuentaById(id);
        if (!cuenta) throw new NotFoundException(`Usuario ${id} no encontrado`);
        return this.usersService.updateFull(id, cuenta.rol, dto, false);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles('admin')
    deactivate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.deactivate(id);
    }

    @Patch(':id/reactivar')
    @HttpCode(HttpStatus.OK)
    @Roles('admin')
    reactivate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.reactivate(id);
    }

    @Post('parent-child')
    @Roles('admin', 'staff', 'docente')
    linkPadreAlumno(@Body() dto: LinkPadreAlumnoDto) {
        return this.usersService.linkPadreAlumno(dto);
    }

    @Get('parent-child/recent')
    @Roles('admin', 'staff', 'docente')
    getRecentParentLinks(@Query('limit') limit = '10') {
        const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
        return this.usersService.getRecentParentLinks(n);
    }

    @Get('alumnos/:id/padres')
    @Roles('admin', 'staff', 'psicologa', 'docente')
    getPadresOfAlumno(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.getPadresOfAlumno(id);
    }
}