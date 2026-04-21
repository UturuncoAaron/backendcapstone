import {
    Controller, Post, Get,
    UploadedFile, UseInterceptors,
    Query, BadRequestException, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ImportService } from './import.service.js';
import { ImportQueryDto } from './dto/import-query.dto.js';

// TODO: agregar JwtAuthGuard + Roles('admin') cuando se implemente JWT
@Controller('admin/import')
export class ImportController {
    constructor(private readonly importService: ImportService) { }

    /**
     * POST /api/admin/import/students?seccion_id=1&periodo_id=1
     * Body: multipart/form-data — campo "file" con el CSV
     *
     * Columnas CSV:
     * tipo_documento, numero_documento, nombre, apellido_paterno,
     * apellido_materno (opc), fecha_nacimiento (opc), email (opc),
     * telefono (opc), codigo_estudiante (opc)
     */
    @Post('students')
    @UseInterceptors(FileInterceptor('file'))
    async importStudents(
        @UploadedFile() file: Express.Multer.File,
        @Query() query: ImportQueryDto,
    ) {
        if (!file) {
            throw new BadRequestException('Se requiere un archivo CSV (campo: file)');
        }

        if (!file.originalname.endsWith('.csv')) {
            throw new BadRequestException('El archivo debe ser .csv');
        }

        const rows = this.importService.parseCsv(file.buffer);
        const result = await this.importService.importStudents(rows, query);

        return result;
    }

    /**
     * GET /api/admin/import/students/template
     * Descarga CSV de ejemplo para importación
     */
    @Get('students/template')
    downloadTemplate(@Res() res: Response): void {
        const headers = 'tipo_documento,numero_documento,nombre,apellido_paterno,apellido_materno,fecha_nacimiento,email,telefono,codigo_estudiante';
        const example = 'dni,12345678,Juan,García,López,2010-03-15,juan@mail.com,999888777,EST001';
        const csv = [headers, example].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla_importar_alumnos.csv"');
        res.send('\uFEFF' + csv);
    }
}