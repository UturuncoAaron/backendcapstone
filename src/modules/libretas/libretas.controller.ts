import {
    Controller, Get, Post, Delete,
    Param, ParseUUIDPipe,
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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('libretas')
export class LibretasController {
    constructor(private readonly libretasService: LibretasService) { }

    // ══════════════════════════════════════════════════════════════════════════
    // LECTURA
    // ══════════════════════════════════════════════════════════════════════════

    @Get('me')
    @Roles('alumno', 'padre')
    findMine(@CurrentUser() user: AuthUser) {
        const tipo: LibretaTipo = user.rol === 'padre' ? 'padre' : 'alumno';
        return this.libretasService.findByCuenta(user.id, tipo);
    }

    @Get('hijo/:alumnoId')
    @Roles('padre')
    findByHijo(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.libretasService.findHijoForPadre(user.id, alumnoId);
    }

    // ✅ periodoId es UUID — ParseUUIDPipe en vez de ParseIntPipe
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

    // ══════════════════════════════════════════════════════════════════════════
    // SUBIDA INDIVIDUAL
    // ══════════════════════════════════════════════════════════════════════════

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
            cuenta_id:     body.cuenta_id,
            tipo:          'alumno',
            periodo_id:    body.periodo_id,   // ✅ UUID string, sin parseInt
            subido_por:    user.id,
            rol:           user.rol,
            observaciones: body.observaciones,
            file,
        });
    }

    @Post('padre')
    @Roles('admin')
    @UseInterceptors(FileInterceptor('file', MULTER_MEMORY))
    upsertPadre(
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { cuenta_id: string; periodo_id: string; observaciones?: string },
    ) {
        if (!file) throw new BadRequestException('Se requiere el archivo (campo: file)');
        return this.libretasService.upsert({
            cuenta_id:     body.cuenta_id,
            tipo:          'padre',
            periodo_id:    body.periodo_id,   // ✅ UUID string, sin parseInt
            subido_por:    user.id,
            rol:           user.rol,
            observaciones: body.observaciones,
            file,
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CARGA MASIVA
    // POST /libretas/bulk
    // FormData: files[] + seccion_id + periodo_id (ambos UUID string)
    // ══════════════════════════════════════════════════════════════════════════

    @Post('bulk')
    @Roles('admin', 'docente')
    @UseInterceptors(
        FilesInterceptor('files', 50, {
            storage: memoryStorage(),
            fileFilter: (_req, file, cb) => {
                const allowed = /\.(pdf|jpg|jpeg|png)$/i.test(file.originalname);
                cb(
                    allowed ? null : new BadRequestException(`Tipo no permitido: ${file.originalname}`),
                    allowed,
                );
            },
            limits: { fileSize: 10 * 1024 * 1024 },
        }),
    )
    async bulkUpload(
        @CurrentUser() user: AuthUser,
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: { seccion_id: string; periodo_id: string },
    ) {
        if (!files?.length) {
            throw new BadRequestException('Se requiere al menos un archivo (campo: files)');
        }
        if (!body.seccion_id) {
            throw new BadRequestException('seccion_id es requerido');
        }
        if (!body.periodo_id) {
            throw new BadRequestException('periodo_id es requerido');
        }

        return this.libretasService.bulkUpsert({
            files,
            periodoId: body.periodo_id,
            seccionId: body.seccion_id,
            subidoPor: user.id,
            rol:       user.rol,
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ELIMINAR
    // ══════════════════════════════════════════════════════════════════════════

    @Delete(':id')
    @Roles('admin', 'docente')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.libretasService.remove(id, user.id, user.rol);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    private parseTipo(raw: string): LibretaTipo {
        if (raw !== 'alumno' && raw !== 'padre') {
            throw new BadRequestException(`tipo inválido: ${raw}`);
        }
        return raw;
    }
}