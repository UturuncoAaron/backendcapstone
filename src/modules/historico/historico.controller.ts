// Ubicación: src/modules/historico/historico.controller.ts
//
// Endpoints del módulo histórico de alumnos.
// Convención de ruta: igual que el resto del panel admin → `admin/historico/...`
// El prefijo global `api` se aplica en `main.ts`, por lo que el cliente
// llama a `/api/admin/historico/...`.

import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { HistoricoService } from './historico.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('admin/historico')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class HistoricoController {
  constructor(private readonly historicoService: HistoricoService) {}

  // ─────────────────────────────────────────────────────────────
  // GET /api/admin/historico/anios
  // Devuelve los años académicos disponibles (unión de
  // alumnos.anio_ingreso y periodos.anio).
  // ─────────────────────────────────────────────────────────────
  @Get('anios')
  getAnios() {
    return this.historicoService.findAniosDisponibles();
  }

  // ─────────────────────────────────────────────────────────────
  // GET /api/admin/historico/filtros?anio=2024
  // Devuelve grados y secciones que tuvieron alumnos matriculados
  // ese año. Pensado para poblar los filtros del frontend.
  // ─────────────────────────────────────────────────────────────
  @Get('filtros')
  getFiltros(@Query('anio') anio: string) {
    return this.historicoService.findFiltrosPorAnio(parseInt(anio, 10));
  }

  // ─────────────────────────────────────────────────────────────
  // GET /api/admin/historico/alumnos?anio=2024&grado_id=...&seccion_id=...&page=1&limit=20
  // Listado paginado de alumnos del año indicado, con su matrícula
  // (grado, sección, período) correspondiente.
  // ─────────────────────────────────────────────────────────────
  @Get('alumnos')
  getAlumnos(
    @Query('anio') anio: string,
    @Query('grado_id') gradoId?: string,
    @Query('seccion_id') seccionId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.historicoService.findAlumnosPorAnio({
      anio: parseInt(anio, 10),
      gradoId,
      seccionId,
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
    });
  }
}
