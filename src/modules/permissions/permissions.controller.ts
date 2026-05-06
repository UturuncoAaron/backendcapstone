import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, ParseUUIDPipe,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { CreatePermisoDto, UpdatePermisoDto } from './dto/permissions.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PermissionsController {

    constructor(private readonly service: PermissionsService) { }

    // GET /api/permissions — lista todos los permisos activos
    @Get()
    findAll() {
        return this.service.findAll();
    }

    // GET /api/permissions/cuenta/:id — permisos de una cuenta específica
    @Get('cuenta/:id')
    findByCuenta(@Param('id', ParseUUIDPipe) cuentaId: string) {
        return this.service.findByCuenta(cuentaId);
    }

    // GET /api/permissions/check/:cuentaId/:modulo/:accion
    // Útil para el frontend para saber si mostrar o no un botón
    @Get('check/:cuentaId/:modulo/:accion')
    check(
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
        @Param('modulo') modulo: string,
        @Param('accion') accion: string,
    ) {
        return this.service.hasPermiso(cuentaId, modulo, accion).then(tiene => ({ tiene }));
    }

    // POST /api/permissions — otorgar permiso
    @Post()
    create(
        @Body() dto: CreatePermisoDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.create(dto, user.id);
    }

    // PATCH /api/permissions/:id — activar/desactivar permiso
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdatePermisoDto,
    ) {
        return this.service.update(id, dto);
    }

    // DELETE /api/permissions/:id — revocar permiso (soft delete)
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.remove(id);
    }
}