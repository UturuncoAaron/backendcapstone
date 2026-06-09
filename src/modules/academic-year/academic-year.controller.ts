import {
  BadRequestException,
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
  BulkCondicionFinalDto,
  CambiarSeccionDto,
  CreateAcademicYearDto,
  SetCondicionFinalDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto.js';

@Controller('academic-years')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicYearController {
  constructor(private readonly service: AcademicYearService) { }

  @Get()
  @Roles('admin', 'staff', 'docente')
  list() {
    return this.service.list();
  }

  @Get('current')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno', 'staff')
  getCurrent() {
    return this.service.getCurrent();
  }

  @Get(':anio')
  @Roles('admin', 'staff', 'docente')
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

  @Patch('matriculas/:matriculaId/condicion-final')
  @Roles('admin', 'staff', 'docente')
  setCondicionFinal(
    @Param('matriculaId', ParseUUIDPipe) matriculaId: string,
    @Body() dto: SetCondicionFinalDto,
  ) {
    return this.service.setCondicionFinal(matriculaId, dto);
  }

  @Post('matriculas/bulk-condicion')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'staff', 'docente')
  bulkCondicionFinal(@Body() dto: BulkCondicionFinalDto) {
    return this.service.bulkSetCondicionFinal(dto);
  }

  @Patch('matriculas/:matriculaId/seccion')
  @Roles('admin', 'staff', 'docente')
  cambiarSeccion(
    @Param('matriculaId', ParseUUIDPipe) matriculaId: string,
    @Body() dto: CambiarSeccionDto,
  ) {
    return this.service.cambiarSeccion(matriculaId, dto.seccion_id);
  }

  @Post(':anio/rematriculas/:matriculaId')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'staff', 'docente')
  rematricularAlumno(
    @Param('anio', ParseIntPipe) anio: number,
    @Param('matriculaId', ParseUUIDPipe) matriculaId: string,
    @Body() dto: SetCondicionFinalDto,
  ) {
    const condicion = dto.condicion as string;
    if (condicion === 'retirado' || condicion === 'pendiente')
      throw new BadRequestException(
        'Solo se puede rematricular con condición "aprobado" o "desaprobado"',
      );
    return this.service.rematricularAlumno(
      anio,
      matriculaId,
      dto.condicion as 'aprobado' | 'desaprobado',
    );
  }

  @Post(':anio/egresados/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  deactivateEgresados(@Param('anio', ParseIntPipe) anio: number) {
    return this.service.runEgresadoDeactivation(anio);
  }
}