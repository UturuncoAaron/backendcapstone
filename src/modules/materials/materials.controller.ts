import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, HttpCode, HttpStatus,
    UseInterceptors, UploadedFile, UseGuards,
    ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MaterialsService } from './materials.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateMaterialDto } from './dto/create-material.dto.js';
import { UpdateMaterialDto } from './dto/update-material.dto.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MIME_PERMITIDOS =
    /^(application\/pdf|image\/(png|jpe?g|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-(excel|powerpoint))|text\/plain)$/;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses/:courseId/materials')
export class MaterialsController {
    constructor(private readonly materialsService: MaterialsService) { }

    @Get()
    @Roles('alumno', 'docente', 'admin', 'padre')
    findAll(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: any,
    ) {
        const alumnoId = user?.rol === 'alumno' ? user.sub : undefined;
        return this.materialsService.findByCourse(courseId, alumnoId);
    }

    @Get(':id')
    @Roles('alumno', 'docente', 'admin', 'padre')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.materialsService.findOne(id);
    }

    @Get(':id/download')
    @Roles('alumno', 'docente', 'admin', 'padre')
    download(@Param('id', ParseUUIDPipe) id: string) {
        return this.materialsService.getDownloadInfo(id);
    }

    @Get(':id/preview')
    @Roles('alumno', 'docente', 'admin', 'padre')
    preview(@Param('id', ParseUUIDPipe) id: string) {
        return this.materialsService.getPreviewInfo(id);
    }

    @Post(':id/view')
    @Roles('alumno')
    @HttpCode(HttpStatus.OK)
    markViewed(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.materialsService.markViewed(id, user.sub);
    }

    @Post()
    @Roles('docente', 'admin')
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: MAX_FILE_BYTES },
    }))
    create(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: CreateMaterialDto,
        @UploadedFile(new ParseFilePipe({
            fileIsRequired: false,
            validators: [
                new MaxFileSizeValidator({ maxSize: MAX_FILE_BYTES, message: 'El archivo supera 10 MB' }),
                new FileTypeValidator({ fileType: MIME_PERMITIDOS }),
            ],
        })) file?: Express.Multer.File,
    ) {
        return this.materialsService.create(courseId, dto, file);
    }

    @Patch(':id')
    @Roles('docente', 'admin')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: UpdateMaterialDto,
    ) {
        return this.materialsService.update(
            id,
            user?.sub ?? 'dev',
            user?.rol ?? 'admin',
            dto,
        );
    }

    @Delete(':id')
    @Roles('docente', 'admin')
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
