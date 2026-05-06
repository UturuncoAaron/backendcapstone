import {
    Controller, Get, Post, Delete,
    Param, ParseUUIDPipe, ParseIntPipe,
    Body, HttpCode, HttpStatus,
    UseGuards, UseInterceptors, UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { LibretasService } from './libretas.service.js';
import { LibretaTipo } from './entities/libreta.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('libretas')
export class LibretasController {
    constructor(private readonly libretasService: LibretasService) { }

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
    @Get(':tipo/:cuentaId/periodo/:periodoId')
    @Roles('admin', 'docente')
    findOne(
        @Param('tipo') tipo: string,
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
        @Param('periodoId', ParseIntPipe) periodoId: number,
    ) {
        return this.libretasService.findByCuentaAndPeriodo(
            cuentaId, periodoId, this.parseTipo(tipo),
        );
    }
    @Post('alumno')
    @Roles('admin', 'docente')
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    upsertAlumno(
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: {
            cuenta_id: string;
            periodo_id: string;
            observaciones?: string;
        },
    ) {
        return this.libretasService.upsert({
            cuenta_id: body.cuenta_id,
            tipo: 'alumno',
            periodo_id: parseInt(body.periodo_id),
            subido_por: user.id,
            rol: user.rol,
            observaciones: body.observaciones,
            file,
        });
    }
    @Post('padre')
    @Roles('admin')
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    upsertPadre(
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: {
            cuenta_id: string;
            periodo_id: string;
            observaciones?: string;
        },
    ) {
        return this.libretasService.upsert({
            cuenta_id: body.cuenta_id,
            tipo: 'padre',
            periodo_id: parseInt(body.periodo_id),
            subido_por: user.id,
            rol: user.rol,
            observaciones: body.observaciones,
            file,
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
