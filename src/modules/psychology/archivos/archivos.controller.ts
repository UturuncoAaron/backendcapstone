import {
    Body, Controller, Delete, Get, HttpCode, HttpStatus, Param,
    ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard }   from '../../auth/guards/roles.guard.js';
import { Roles }        from '../../auth/decorators/roles.decorator.js';
import { CurrentUser }  from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';

import { CreateArchivoDto, ArchivoQueryDto } from '../dto/psychology.dto.js';
import { PsychologyArchivosService } from './archivos.service.js';

@Controller('psychology/archivos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('psicologa')
export class PsychologyArchivosController {
    constructor(private readonly service: PsychologyArchivosService) { }

    /**
     * POST /psychology/archivos/student/:studentId
     * multipart/form-data:
     *   - file        (binario, máx 10 MB, cualquier tipo)
     *   - categoria   ('ficha' | 'test')
     *   - nombre?     (opcional)
     *   - descripcion?
     *   - confidencial? ("true" | "false", default "true")
     */
    @Post('student/:studentId')
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
    }))
    upload(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: CreateArchivoDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.upload(user.id, studentId, file, dto);
    }

    /** GET /psychology/archivos/student/:studentId?categoria=ficha|test */
    @Get('student/:studentId')
    list(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @Query() q: ArchivoQueryDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.list(user.id, studentId, q);
    }

    /** GET /psychology/archivos/:id/url — URL firmada (1 h). */
    @Get(':id/url')
    url(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getDownloadUrl(user.id, id);
    }

    /** DELETE /psychology/archivos/:id */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    delete(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.delete(user.id, id);
    }
}