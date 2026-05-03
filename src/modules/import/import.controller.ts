import {
    Controller, Post, Get,
    UploadedFile, UseInterceptors,
    Query, BadRequestException, Res, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ImportService } from './import.service.js';
import { ImportQueryDto } from './dto/import-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/import')
export class ImportController {
    constructor(private readonly importService: ImportService) { }

    @Post('students')
    @Roles('admin')
    @UseInterceptors(FileInterceptor('file'))
    async importStudents(
        @UploadedFile() file: Express.Multer.File,
        @Query() query: ImportQueryDto,
    ) {
        if (!file) throw new BadRequestException('Se requiere un archivo CSV (campo: file)');
        if (!file.originalname.endsWith('.csv')) throw new BadRequestException('El archivo debe ser .csv');

        const rows = this.importService.parseCsv(file.buffer);
        return this.importService.importStudents(rows, query);
    }

    @Get('students/template')
    @Roles('admin')
    downloadTemplate(@Res() res: Response): void {
        const headers = 'tipo_documento,numero_documento,nombre,apellido_paterno,apellido_materno,fecha_nacimiento,email,telefono,codigo_estudiante';
        const example = 'dni,12345678,Juan,García,López,2010-03-15,juan@mail.com,999888777,EST001';
        const csv = [headers, example].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla_importar_alumnos.csv"');
        res.send('\uFEFF' + csv);
    }
}