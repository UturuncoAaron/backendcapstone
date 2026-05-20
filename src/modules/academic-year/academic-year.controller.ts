import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

import { AcademicYearService } from './academic-year.service.js';
import {
  CreateAcademicYearDto,
  SetCondicionFinalDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto.js';

/**
 * Endpoints del módulo de Año Lectivo.
 *
 * Todos los endpoints son admin-only excepto `GET current` que cualquier
 * rol autenticado puede llamar (se usa para mostrar el año actual en el
 * header del FE).
 */
@Controller('academic-years')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicYearController {
  constructor(private readonly service: AcademicYearService) {}

  @Get()
  @Roles('admin')
  list() {
    return this.service.list();
  }

  /** Año en curso — accesible a todos los roles autenticados. */
  @Get('current')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno', 'auxiliar')
  getCurrent() {
    return this.service.getCurrent();
  }

  @Get(':anio')
  @Roles('admin')
  getByAnio(@Param('anio', ParseIntPipe) anio: number) {
    return this.service.getByAnio(anio);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateAcademicYearDto) {
    return this.service.create(dto);
  }

  @Patch(':anio')
  @Roles('admin')
  update(
    @Param('anio', ParseIntPipe) anio: number,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.service.update(anio, dto);
  }

  @Patch(':anio/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  activate(@Param('anio', ParseIntPipe) anio: number) {
    return this.service.activate(anio);
  }

  // ── Promoción ──────────────────────────────────────────────────
  @Get(':anio/promotion/preview')
  @Roles('admin')
  previewPromotion(@Param('anio', ParseIntPipe) anio: number) {
    return this.service.previewPromotion(anio);
  }

  @Post(':anio/promotion/run')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  runPromotion(@Param('anio', ParseIntPipe) anio: number) {
    return this.service.runPromotion(anio);
  }

  // ── Desactivación de egresados ────────────────────────────────
  @Post(':anio/egresados/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  deactivateEgresados(@Param('anio', ParseIntPipe) anio: number) {
    return this.service.runEgresadoDeactivation(anio);
  }

  // ── Condición final de una matrícula (al cierre del año) ──────
  @Patch('matriculas/:matriculaId/condicion-final')
  @Roles('admin')
  setCondicionFinal(
    @Param('matriculaId', ParseUUIDPipe) matriculaId: string,
    @Body() dto: SetCondicionFinalDto,
  ) {
    return this.service.setCondicionFinal(matriculaId, dto);
  }
}
