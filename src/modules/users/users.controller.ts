import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('admin/users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // POST /api/admin/users
    @Post()
    create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    // GET /api/admin/users
    // GET /api/admin/users?rol=alumno
    @Get()
    findAll(@Query('rol') rol?: string) {
        return this.usersService.findAll(rol);
    }
    // GET /api/admin/stats
    @Get('/stats')
    getStats() {
        return this.usersService.getStats();
    }
    // GET /api/admin/users/:id
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findOne(id);
    }

    // PATCH /api/admin/users/:id
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserDto,
    ) {
        return this.usersService.update(id, dto);
    }

    // DELETE /api/admin/users/:id (desactivar, no borrar)
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    deactivate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.deactivate(id);
    }

    // PATCH /api/admin/users/:id/reset-password
    @Patch(':id/reset-password')
    resetPassword(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('password') password: string,
    ) {
        return this.usersService.resetPassword(id, password);
    }
    // POST /api/admin/parent-child
    @Post('parent-child')
    async linkParentChild(
        @Body() dto: { padre_doc: string; alumno_doc: string },
    ) {
        return this.usersService.linkParentChild(dto.padre_doc, dto.alumno_doc);
    }
}