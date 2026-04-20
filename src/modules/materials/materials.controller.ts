import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, HttpCode, HttpStatus,
    UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MaterialsService } from './materials.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { TipoMaterial } from './entities/material.entity.js';

@Controller('courses/:courseId/materials')
export class MaterialsController {
    constructor(private readonly materialsService: MaterialsService) { }

    // GET /api/courses/:courseId/materials
    @Get()
    findAll(@Param('courseId', ParseUUIDPipe) courseId: string) {
        return this.materialsService.findByCourse(courseId);
    }

    // GET /api/courses/:courseId/materials/:id
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.materialsService.findOne(id);
    }

    // POST /api/courses/:courseId/materials
    // Acepta multipart/form-data (con archivo) o application/json (con url)
    @Post()
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    create(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() body: {
            titulo: string;
            tipo: TipoMaterial;
            url?: string;
            descripcion?: string;
            orden?: string;
        },
        @UploadedFile() file?: Express.Multer.File,
    ) {
        // Debe venir archivo O url, no ninguno de los dos
        if (!file && !body.url) {
            throw new BadRequestException('Debes proporcionar un archivo o una URL');
        }

        return this.materialsService.create({
            curso_id: courseId,
            titulo: body.titulo,
            tipo: body.tipo,
            url: body.url ?? '',
            descripcion: body.descripcion,
            orden: body.orden ? parseInt(body.orden) : 0,
            file: file ?? undefined,
        });
    }

    // PATCH /api/courses/:courseId/materials/:id
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: {
            titulo?: string;
            descripcion?: string;
            orden?: number;
        },
    ) {
        return this.materialsService.update(
            id,
            user?.sub ?? 'dev',
            user?.rol ?? 'admin',
            dto,
        );
    }

    // DELETE /api/courses/:courseId/materials/:id
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.materialsService.remove(
            id,
            user?.sub ?? 'dev',
            user?.rol ?? 'admin',
        );
    }
}