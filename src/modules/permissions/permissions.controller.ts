import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { CreatePermisoDto, UpdatePermisoDto } from './dto/permissions.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionsController {

    constructor(private readonly service: PermissionsService) { }

    // Solo admin gestiona permisos
    @Get()
    @Roles('admin')
    findAll() {
        return this.service.findAll();
    }

    // Admin consulta permisos de cualquier cuenta
    @Get('cuenta/:id')
    @Roles('admin')
    findByCuenta(@Param('id', ParseUUIDPipe) cuentaId: string) {
        return this.service.findByCuenta(cuentaId);
    }

    // Cualquier rol autenticado puede verificar sus propios permisos
    @Get('check/:cuentaId/:modulo/:accion')
    @Roles('admin', 'docente', 'psicologa', 'auxiliar', 'alumno', 'padre')
    check(
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
        @Param('modulo') modulo: string,
        @Param('accion') accion: string,
    ) {
        return this.service.hasPermiso(cuentaId, modulo, accion)
            .then(tiene => ({ tiene }));
    }

    @Post()
    @Roles('admin')
    create(
        @Body() dto: CreatePermisoDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.create(dto, user.id);
    }

    @Patch(':id')
    @Roles('admin')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdatePermisoDto,
    ) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @Roles('admin')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.remove(id);
    }
}