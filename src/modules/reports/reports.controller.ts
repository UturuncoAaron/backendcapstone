import { Controller, Get, Query, Res, UseGuards, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service.js';
import { QueryReportDto } from './dto/query-report.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { buildXlsx, workbookToBuffer, buildFilename } from './excel/excel.helper.js';
import { AttendancePdfBuilder } from './attendance/attendance-pdf-builder.service.js';

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff', 'docente')
export class ReportsController {
    constructor(
        private readonly reportsService: ReportsService,
        private readonly pdfBuilder: AttendancePdfBuilder,
    ) { }

    @Get('attendance/teachers')
    @Roles('admin', 'staff')
    async getTeacherAttendanceData(
        @CurrentUser() user: AuthUser,
        @Query('fecha_inicio') fechaInicio: string,
        @Query('fecha_fin') fechaFin: string,
        @Query('cuenta_id') cuentaId?: string,
    ) {
        if (!fechaInicio || !fechaFin) {
            throw new BadRequestException('fecha_inicio y fecha_fin son requeridas');
        }
        return this.reportsService.generateConsolidatedData(user, {
            scope: 'teacher_attendance_range',
            format: 'json',
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            cuenta_id: cuentaId,
            umbral: 11
        });
    }

    @Get('attendance/staff')
    @Roles('admin', 'staff')
    async getStaffAttendanceData(
        @CurrentUser() user: AuthUser,
        @Query('fecha_inicio') fechaInicio: string,
        @Query('fecha_fin') fechaFin: string,
        @Query('cuenta_id') cuentaId?: string,
    ) {
        if (!fechaInicio || !fechaFin) {
            throw new BadRequestException('fecha_inicio y fecha_fin son requeridas');
        }
        return this.reportsService.generateConsolidatedData(user, {
            scope: 'staff_attendance_range',
            format: 'json',
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            cuenta_id: cuentaId,
            umbral: 11
        });
    }

    @Get('consolidated')
    async getConsolidatedReport(
        @CurrentUser() user: AuthUser,
        @Query() query: QueryReportDto,
        @Res() res: Response,
    ): Promise<void> {
        const rawData = await this.reportsService.generateConsolidatedData(user, query);

        if (query.format === 'json') {
            res.status(200).json(rawData);
            return;
        }

        if (query.format === 'csv') {
            const csvString = this.reportsService.buildCsv(rawData);
            const filename = buildFilename(`reporte_${query.scope}_${query.anio ?? 'activo'}`);
            const bom = Buffer.from('\uFEFF', 'utf-8');
            const csvBuffer = Buffer.concat([bom, Buffer.from(csvString, 'utf-8')]);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            res.status(200).send(csvBuffer);
            return;
        }

        if (query.format === 'pdf') {
            let pdfBuffer: Buffer;
            const filename = buildFilename(`reporte_${query.scope}_${query.anio ?? 'activo'}`);

            if (query.scope === 'academic_general') {
                pdfBuffer = await this.pdfBuilder.buildTablePdf(rawData, {
                    title: 'Consolidado Académico',
                    subtitle: `Año Lectivo: ${query.anio ?? 'Activo'}`,
                    headers: ['DNI', 'Estudiante / Alumno', 'Curso', 'Bim.', 'Nota', 'Escala'],
                    keys: ['numero_documento', 'alumno_nombre', 'curso', 'bimestre', 'nota', 'escala'],
                    columnWidths: [75, 180, 140, 40, 40, 40],
                    alignments: ['left', 'left', 'left', 'center', 'right', 'center'],
                });
            } else if (query.scope === 'section_summary') {
                const dataset = rawData.ranking ?? rawData;
                pdfBuffer = await this.pdfBuilder.buildTablePdf(dataset, {
                    title: 'Resumen de Sección',
                    subtitle: `Evaluación de Rendimiento Académico Integral`,
                    headers: ['DNI', 'Estudiante / Alumno', 'Prom. Gral', 'Cursos Riesgo', 'Categoría'],
                    keys: ['dni', 'alumno_nombre', 'promedio_general', 'cursos_en_riesgo', 'categoria'],
                    columnWidths: [85, 230, 65, 70, 65],
                    alignments: ['left', 'left', 'right', 'center', 'center'],
                });
            } else if (query.scope === 'teacher_attendance_range') {
                pdfBuffer = await this.pdfBuilder.buildTablePdf(rawData, {
                    title: 'Asistencia de Docentes',
                    subtitle: `Rango: ${query.fecha_inicio} al ${query.fecha_fin}`,
                    headers: ['Docente / Colaborador', 'Mód. Esp.', 'Pres.', 'Tard.', 'Faltos', 'Efectividad'],
                    keys: ['docente_nombre', 'total_bloques_esperados', 'presentes', 'tardanzas', 'faltos', 'porcentaje_asistencia'],
                    columnWidths: [225, 65, 55, 55, 55, 60],
                    alignments: ['left', 'center', 'center', 'center', 'center', 'right'],
                });
            } else if (query.scope === 'staff_attendance_range') {
                pdfBuffer = await this.pdfBuilder.buildTablePdf(rawData, {
                    title: 'Asistencia de Personal de Apoyo (Staff)',
                    subtitle: `Rango: ${query.fecha_inicio} al ${query.fecha_fin}`,
                    headers: ['Colaborador', 'Cargo', 'Días Esp.', 'Pres.', 'Tard.', 'Faltos', 'Efectividad'],
                    keys: ['staff_nombre', 'cargo', 'total_esperados', 'presentes', 'tardanzas', 'faltos', 'porcentaje_asistencia'],
                    columnWidths: [200, 90, 55, 45, 45, 45, 55],
                    alignments: ['left', 'left', 'center', 'center', 'center', 'center', 'right'],
                });
            } else if (query.scope === 'course_ranking') {
                pdfBuffer = await this.pdfBuilder.buildTablePdf(rawData, {
                    title: 'Ranking de Promedios por Curso',
                    subtitle: `Métricas operacionales analíticas por aula`,
                    headers: ['DNI', 'Estudiante / Alumno', 'Notas Reg.', 'Promedio', 'Escala'],
                    keys: ['dni', 'nombre', 'notas_registradas', 'promedio', 'escala'],
                    columnWidths: [85, 250, 65, 60, 55],
                    alignments: ['left', 'left', 'center', 'right', 'center'],
                });
            } else {
                throw new BadRequestException('El ámbito seleccionado no tiene una plantilla PDF configurada');
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            res.status(200).send(pdfBuffer);
            return;
        }

        let workbook: any;
        if (query.scope === 'academic_general') {
            workbook = buildXlsx('Consolidado Académico', rawData, {
                numero_documento: 'DNI/Documento',
                alumno_nombre: 'Estudiante / Alumno',
                grado: 'Grado',
                seccion: 'Sección',
                curso: 'Curso',
                bimestre: 'Bimestre',
                actividad: 'Actividad',
                tipo: 'Tipo',
                nota: 'Nota',
                escala: 'Escala',
                asistencias_generales_presente: 'Asist. Gral Presente',
                asistencias_generales_falta: 'Asist. Gral Falta',
                asistencias_curso_presente: 'Asist. Curso Presente',
                asistencias_curso_falta: 'Asist. Curso Falta'
            });
        } else if (query.scope === 'section_summary') {
            workbook = buildXlsx('Resumen de Sección', rawData.ranking, {
                dni: 'DNI',
                alumno_nombre: 'Estudiante / Alumno',
                promedio_general: 'Promedio General',
                cursos_en_riesgo: 'Cursos en Riesgo',
                categoria: 'Categoría'
            });
        } else if (query.scope === 'teacher_attendance_range') {
            workbook = buildXlsx('Asistencia Docentes', rawData, {
                docente_nombre: 'Docente / Colaborador',
                total_bloques_esperados: 'Módulos Esperados',
                presentes: 'Presentes',
                tardanzas: 'Tardanzas',
                faltos: 'Faltas',
                porcentaje_asistencia: 'Efectividad'
            });
        } else if (query.scope === 'staff_attendance_range') {
            workbook = buildXlsx('Asistencia Staff', rawData, {
                staff_nombre: 'Colaborador',
                cargo: 'Cargo',
                total_esperados: 'Días Esperados',
                presentes: 'Presentes',
                tardanzas: 'Tardanzas',
                faltos: 'Faltas',
                porcentaje_asistencia: 'Efectividad'
            });
        } else if (query.scope === 'course_ranking') {
            workbook = buildXlsx('Ranking del Curso', rawData, {
                dni: 'DNI',
                nombre: 'Estudiante / Alumno',
                notas_registradas: 'Notas Registradas',
                promedio: 'Promedio',
                escala: 'Escala'
            });
        } else {
            workbook = buildXlsx('Reporte EduAula', rawData, {});
        }

        const buffer = await workbookToBuffer(workbook);
        const filename = buildFilename(`reporte_${query.scope}_${query.anio ?? 'activo'}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
        res.status(200).send(buffer);
    }
}