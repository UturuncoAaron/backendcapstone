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
        if (!file) throw new BadRequestException('Se requiere un archivo (campo: file)');
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (!['csv', 'xls', 'xlsx'].includes(ext || '')) {
            throw new BadRequestException('El archivo debe ser .csv, .xls o .xlsx');
        }
        const rows = await this.importService.parseFile(file.originalname, file.buffer);
        return this.importService.importStudents(rows, query);
    }

    // Sigue siendo @Roles('admin') — el frontend usa ApiService (JWT en header)
    @Get('students/template')
    @Roles('admin')
    @UseInterceptors()
    async downloadTemplate(@Res() res: Response): Promise<void> {
        const buffer = await this.importService.buildTemplatexlsx();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla_importar_alumnos.xlsx"');
        res.send(buffer);
    }
}