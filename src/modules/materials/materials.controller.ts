import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { MaterialsService } from './materials.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

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
    @Post()
    create(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: {
            titulo: string;
            tipo: string;
            url: string;
            descripcion?: string;
            orden?: number;
        },
    ) {
        return this.materialsService.create({ ...dto, curso_id: courseId });
    }

    // PATCH /api/courses/:courseId/materials/:id
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() dto: { titulo?: string; descripcion?: string; orden?: number },
    ) {
        return this.materialsService.update(
            id, user?.sub ?? 'dev', user?.rol ?? 'admin', dto,
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
            id, user?.sub ?? 'dev', user?.rol ?? 'admin',
        );
    }
}