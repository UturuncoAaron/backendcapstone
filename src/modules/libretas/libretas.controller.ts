import {
    Controller, Get, Post, Delete,
    Param, ParseUUIDPipe, Query,
    Body, HttpCode, HttpStatus,
    UseGuards, UseInterceptors, UploadedFile, UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { LibretasService } from './libretas.service.js';
import { LibretaTipo } from './entities/libreta.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

const MULTER_MEMORY = { storage: memoryStorage() };
const MULTER_BULK = {
    storage: memoryStorage(),
    fileFilter: (_req: any, file: any, cb: any) => {
        const ok = /\.(pdf|jpg|jpeg|png)$/i.test(file.originalname);
        cb(ok ? null : new BadRequestException(`Tipo no permitido: ${file.originalname}`), ok);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('libretas')
export class LibretasController {
    constructor(private readonly libretasService: LibretasService) { }

    @Get('me')
    @Roles('alumno', 'padre')
    findMine(@CurrentUser() user: AuthUser) {
        const tipo: LibretaTipo = user.rol === 'padre' ? 'padre' : 'alumno';
        return this.libretasService.findByCuenta(user.id, tipo, user.id);
    }

    @Get('padre/me/full')
    @Roles('padre')
    findMineFull(@CurrentUser() user: AuthUser) {
        return this.libretasService.findPadreCompleto(user.id);
    }

    @Post(':id/marcar-vista')
    @Roles('alumno', 'padre')
    @HttpCode(HttpStatus.OK)
    marcarVista(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.libretasService.marcarVista(id, user.id);
    }

    @Get(':id/lecturas')
    @Roles('admin', 'docente')
    lecturas(@Param('id', ParseUUIDPipe) id: string) {
        return this.libretasService.listLecturas(id);
    }

    @Get('hijo/:alumnoId')
    @Roles('padre')
    findByHijo(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.libretasService.findHijoForPadre(user.id, alumnoId);
    }

    @Get(':tipo/:cuentaId/periodo/:periodoId')
    @Roles('admin', 'docente')
    findOne(
        @Param('tipo') tipo: string,
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
        @Param('periodoId', ParseUUIDPipe) periodoId: string,
    ) {
        return this.libretasService.findByCuentaAndPeriodo(
            cuentaId, periodoId, this.parseTipo(tipo),
        );
    }

    @Get('padre/seccion/:seccionId')
    @Roles('admin', 'docente')
    findPadresPorSeccion(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @Query('periodo_id', ParseUUIDPipe) periodoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.libretasService.findPadresPorSeccion(
            seccionId, periodoId, user.id, user.rol,
        );
    }

    @Get('padre/admin/listado')
    @Roles('admin', 'docente')
    findPadresAdminPaginated(
        @CurrentUser() user: AuthUser,
        @Query('periodo_id', ParseUUIDPipe) periodoId: string,
        @Query('seccion_id') seccionId?: string,
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
        return this.libretasService.findPadresAdminPaginated({
            periodoId,
            seccionId: seccionId?.trim() || null,
            search: search?.trim() || null,
            page: pageNum,
            limit: limitNum,
        });
    }

    @Post('alumno')
    @Roles('admin', 'docente')
    @UseInterceptors(FileInterceptor('file', MULTER_MEMORY))
    upsertAlumno(
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { cuenta_id: string; periodo_id: string; observaciones?: string },
    ) {
        if (!file) throw new BadRequestException('Se requiere el archivo (campo: file)');
        return this.libretasService.upsert({
            cuenta_id: body.cuenta_id, tipo: 'alumno',
            periodo_id: body.periodo_id, subido_por: user.id,
            rol: user.rol, observaciones: body.observaciones, file,
        });
    }

    @Post('padre')
    @Roles('admin', 'docente')
    @UseInterceptors(FileInterceptor('file', MULTER_MEMORY))
    upsertPadre(
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { cuenta_id: string; periodo_id: string; observaciones?: string },
    ) {
        if (!file) throw new BadRequestException('Se requiere el archivo (campo: file)');
        return this.libretasService.upsert({
            cuenta_id: body.cuenta_id, tipo: 'padre',
            periodo_id: body.periodo_id, subido_por: user.id,
            rol: user.rol, observaciones: body.observaciones, file,
        });
    }

    @Post('bulk')
    @Roles('admin', 'docente')
    @UseInterceptors(FilesInterceptor('files', 50, MULTER_BULK))
    async bulkUpload(
        @CurrentUser() user: AuthUser,
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: { seccion_id: string; periodo_id: string },
    ) {
        if (!files?.length) throw new BadRequestException('Se requiere al menos un archivo (campo: files)');
        if (!body.seccion_id) throw new BadRequestException('seccion_id es requerido');
        if (!body.periodo_id) throw new BadRequestException('periodo_id es requerido');
        return this.libretasService.bulkUpsert({
            files, periodoId: body.periodo_id,
            seccionId: body.seccion_id, subidoPor: user.id, rol: user.rol,
        });
    }

    @Post('bulk-padre')
    @Roles('admin', 'docente')
    @UseInterceptors(FilesInterceptor('files', 50, MULTER_BULK))
    async bulkUploadPadre(
        @CurrentUser() user: AuthUser,
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: { periodo_id: string; assignments: string },
    ) {
        if (!files?.length) throw new BadRequestException('Se requiere al menos un archivo');
        if (!body.periodo_id) throw new BadRequestException('periodo_id es requerido');

        let assignments: { filename: string; padre_id: string }[];
        try {
            assignments = JSON.parse(body.assignments);
            if (!Array.isArray(assignments)) throw new Error();
        } catch {
            throw new BadRequestException('assignments debe ser un JSON array válido');
        }

        return this.libretasService.bulkUpsertPadres({
            files,
            periodoId: body.periodo_id,
            assignments,
            subidoPor: user.id,
            rol: user.rol,
        });
    }

    @Delete(':id')
    @Roles('admin', 'docente')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.libretasService.remove(id, user.id, user.rol);
    }

    private parseTipo(raw: string): LibretaTipo {
        if (raw !== 'alumno' && raw !== 'padre') {
            throw new BadRequestException(`tipo inválido: ${raw}`);
        }
        return raw;
    }
}