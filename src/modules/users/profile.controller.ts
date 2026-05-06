import {
    Controller, Get, Put, Post,
    Body, UseGuards, UseInterceptors,
    UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UsersService } from './users.service.js';
import { UpdateFullDto } from './dto/profile.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class ProfileController {
    constructor(private readonly usersService: UsersService) { }

    // ── GET /api/users/me ─────────────────────────────────────────────────
    @Get('me')
    getMe(@CurrentUser() user: AuthUser) {
        return this.usersService.getProfileById(user.id, user.rol);
    }

    // ── PUT /api/users/me ─────────────────────────────────────────────────

    @Put('me')
    updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateFullDto) {
        return this.usersService.updateFull(user.id, user.rol, dto, true);
    }

    // ── POST /api/users/foto ──────────────────────────────────────────────
    @Post('foto')
    @UseInterceptors(FileInterceptor('foto', {
        storage: memoryStorage(),
        limits: { fileSize: 2 * 1024 * 1024 },
        fileFilter: (_, file, cb) => {
            const allowed = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowed.includes(file.mimetype)) {
                return cb(new BadRequestException('Solo se aceptan JPG, PNG o WEBP'), false);
            }
            cb(null, true);
        },
    }))
    uploadFoto(
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('No se recibió ningún archivo');
        return this.usersService.updateFoto(user.id, user.rol, file);
    }
}