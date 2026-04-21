import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service.js';
import { QueryReportDto } from './dto/query-report.dto.js';

// TODO: agregar JwtAuthGuard + Roles('admin') cuando se implemente JWT
@Controller('admin/reports')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    // GET /api/admin/reports/grades — preview en JSON
    @Get('grades')
    async getGradesJson(@Query() query: QueryReportDto) {
        return this.reportsService.getGradesReport(query);
    }

    // GET /api/admin/reports/grades/export — descarga CSV
    @Get('grades/export')
    async exportGradesCsv(
        @Query() query: QueryReportDto,
        @Res() res: Response,
    ): Promise<void> {
        const rows = await this.reportsService.getGradesReport(query);
        const csv = this.reportsService.buildCsv(rows);

        const filename = `notas_periodo${query.periodo_id ?? 'all'}_bimestre${query.bimestre ?? 'all'}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // BOM para que Excel abra UTF-8 con tildes y ñ correctamente
        res.send('\uFEFF' + csv);
    }
}