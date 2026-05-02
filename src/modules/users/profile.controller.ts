import {
    Controller, Get, Patch, Post,
    Body, Request, UseGuards,
    UseInterceptors, UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsersService } from './users.service.js';
import { UpdateProfileDto, UpdateEmailDto, UpdatePasswordDto } from './profile.dto.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class ProfileController {
    constructor(private readonly usersService: UsersService) { }

    // GET /api/users/me
    @Get('me')
    getMe(@Request() req: any) {
        return this.usersService.getProfileById(req.user.id, req.user.rol);
    }

    // PATCH /api/users/profile
    @Patch('profile')
    updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
        return this.usersService.updateProfile(req.user.id, req.user.rol, dto);
    }

    // PATCH /api/users/email
    @Patch('email')
    updateEmail(@Request() req: any, @Body() dto: UpdateEmailDto) {
        return this.usersService.updateEmail(req.user.id, req.user.rol, dto);
    }

    // PATCH /api/users/password
    @Patch('password')
    updatePassword(@Request() req: any, @Body() dto: UpdatePasswordDto) {
        return this.usersService.updatePasswordProfile(req.user.id, dto);
    }

    // POST /api/users/foto
    @Post('foto')
    @UseInterceptors(FileInterceptor('foto', {
        storage: memoryStorage(),
        limits: { fileSize: 2 * 1024 * 1024 },
        fileFilter: (_, file, cb) => {
            if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
                return cb(new BadRequestException('Solo JPG o PNG'), false);
            }
            cb(null, true);
        },
    }))
    uploadFoto(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No se recibió ningún archivo');
        return this.usersService.updateFoto(req.user.id, req.user.rol, file);
    }
}