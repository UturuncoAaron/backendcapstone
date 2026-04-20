import {
    Controller, Get, Post, Delete,
    Param, ParseUUIDPipe, ParseIntPipe,
    Query, UseInterceptors, UploadedFile,
    Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { LibretasService } from './libretas.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('libretas')
export class LibretasController {
    constructor(private readonly libretasService: LibretasService) { }

    // GET /api/libretas/alumno/:alumnoId
    @Get('alumno/:alumnoId')
    findByAlumno(@Param('alumnoId', ParseUUIDPipe) alumnoId: string) {
        return this.libretasService.findByAlumno(alumnoId);
    }

    // GET /api/libretas/curso/:cursoId?bimestre=1
    @Get('curso/:cursoId')
    findByCurso(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query('bimestre') bimestre?: string,
    ) {
        return this.libretasService.findByCurso(
            cursoId,
            bimestre ? parseInt(bimestre) : undefined,
        );
    }

    // GET /api/libretas/alumno/:alumnoId/curso/:cursoId/bimestre/:bimestre
    @Get('alumno/:alumnoId/curso/:cursoId/bimestre/:bimestre')
    findOne(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Param('bimestre', ParseIntPipe) bimestre: number,
    ) {
        return this.libretasService.findOne(alumnoId, cursoId, bimestre);
    }

    // POST /api/libretas — subir libreta (docente/admin)
    @Post()
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    upsert(
        @CurrentUser() user: any,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: {
            alumno_id: string;
            curso_id: string;
            periodo_id: string;
            bimestre: string;
            observaciones?: string;
        },
    ) {
        return this.libretasService.upsert({
            alumno_id: body.alumno_id,
            curso_id: body.curso_id,
            periodo_id: parseInt(body.periodo_id),
            bimestre: parseInt(body.bimestre),
            subido_por: user?.sub ?? 'dev',
            observaciones: body.observaciones,
            file,
        });
    }

    // DELETE /api/libretas/:id
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.libretasService.remove(
            id,
            user?.sub ?? 'dev',
            user?.rol ?? 'admin',
        );
    }
}
