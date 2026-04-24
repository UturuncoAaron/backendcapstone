import {
    Controller, Get, Post, Delete,
    Param, ParseUUIDPipe, ParseIntPipe,
    Body, HttpCode, HttpStatus,
    UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { LibretasService } from './libretas.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('libretas')
export class LibretasController {
    constructor(private readonly libretasService: LibretasService) { }

    // ── Alumno: ver sus propias libretas ─────────────────────────
    // GET /api/libretas/me
    @Get('me')
    @Roles('alumno')
    findMine(@CurrentUser() user: any) {
        return this.libretasService.findByAlumno(user.sub);
    }

    // ── Padre: ver libretas de un hijo ───────────────────────────
    // GET /api/libretas/hijo/:alumnoId
    @Get('hijo/:alumnoId')
    @Roles('padre')
    findByHijo(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: any,
    ) {
        return this.libretasService.findByAlumnoForPadre(user.sub, alumnoId);
    }

    // ── Admin/Docente: ver libreta de alumno en un periodo ───────
    // GET /api/libretas/alumno/:alumnoId/periodo/:periodoId
    @Get('alumno/:alumnoId/periodo/:periodoId')
    @Roles('admin', 'docente')
    findOne(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Param('periodoId', ParseIntPipe) periodoId: number,
    ) {
        return this.libretasService.findByAlumnoAndPeriodo(alumnoId, periodoId);
    }

    // ── Admin/Docente: subir o reemplazar libreta ────────────────
    // POST /api/libretas
    @Post()
    @Roles('admin', 'docente')
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    upsert(
        @CurrentUser() user: any,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: {
            alumno_id: string;
            periodo_id: string;
            observaciones?: string;
        },
    ) {
        return this.libretasService.upsert({
            alumno_id: body.alumno_id,
            periodo_id: parseInt(body.periodo_id),
            subido_por: user.sub,
            observaciones: body.observaciones,
            file,
        });
    }

    // ── Admin/Docente: eliminar libreta ──────────────────────────
    // DELETE /api/libretas/:id
    @Delete(':id')
    @Roles('admin', 'docente')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.libretasService.remove(id, user.sub, user.rol);
    }
}