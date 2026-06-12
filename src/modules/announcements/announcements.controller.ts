import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';
import { CreateAnnouncementDto } from './dto/create-announcement.dto.js';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PermisoGuard } from '../auth/guards/permiso.guard.js';
import { RequierePermiso } from '../auth/decorators/requiere-permiso.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('comunicados')
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) { }

  @Get()
  @Roles('alumno', 'docente', 'admin', 'padre', 'psicologa', 'staff')
  findAll(@Query() query: QueryAnnouncementsDto, @CurrentUser() user: AuthUser) {
    query.rol = user.rol;
    query.userId = user.id;
    return this.svc.findAll(query);
  }

  @Get('todos')
  @Roles('admin')
  findAllAdmin(
    @Query('size') size?: string,
    @Query('cursor') cursor?: string,
    @Query('anio') anio?: string,
    @Query('activo') activo?: string,
    @Query('orden') orden?: string,
    @Query('buscar') buscar?: string,
  ) {
    return this.svc.findAllAdmin({
      size: size ? parseInt(size) : undefined,
      cursor,
      anio: anio ? parseInt(anio) : undefined,
      activo: activo === undefined ? undefined : activo === 'true',
      orden,
      buscar,
    });
  }

  @Get(':id')
  @Roles('alumno', 'docente', 'admin', 'padre', 'psicologa', 'staff')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.findOne(id, user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermisoGuard)
  @RequierePermiso('comunicados', 'crear')
  async create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser) {
    await this.svc.validateDestinatarios(dto.destinatarios);
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin', 'docente', 'psicologa')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: any,
  ) {
    return this.svc.update(id, user.id, user.rol, dto);
  }

  @Patch(':id/fijar')
  @Roles('admin')
  fijar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { fijado: boolean; fijado_hasta?: string },
  ) {
    return this.svc.fijar(id, body.fijado, body.fijado_hasta);
  }

  @Patch(':id/archivar')
  @Roles('admin', 'docente', 'psicologa')
  archivar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.archivar(id, user.id, user.rol);
  }

  @Get(':id/lecturas')
  @Roles('admin', 'docente', 'psicologa')
  getLecturas(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getLecturas(id);
  }

  @Delete(':id/archivos/:archivoId')
  @Roles('admin', 'docente', 'psicologa')
  deleteArchivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('archivoId', ParseUUIDPipe) archivoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.deleteArchivo(id, archivoId, user.id, user.rol);
  }
}