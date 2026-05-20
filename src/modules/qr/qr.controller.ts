import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { QrService } from './qr.service.js';
import type { AuthUser } from '../auth/types/auth-user.js';
const NO_CACHE = 'no-store';

@Controller('alumnos/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('alumno')
export class QrController {
    constructor(private readonly qr: QrService) {}

    /** PNG 500×500 — resolución óptima para impresión en carnet */
    @Get('qr.png')
    async getPng(
        @CurrentUser() user: AuthUser,
        @Res() res: Response,
    ): Promise<void> {
        const buffer = await this.qr.generatePng(user.id);
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': 'attachment; filename="mi-qr.png"',
            'Cache-Control': NO_CACHE,
        });
        res.send(buffer);
    }

    /** SVG — para impresión en cualquier tamaño sin pérdida de calidad */
    @Get('qr.svg')
    async getSvg(
        @CurrentUser() user: AuthUser,
        @Res() res: Response,
    ): Promise<void> {
        const svg = await this.qr.generateSvg(user.id);
        res.set({
            'Content-Type': 'image/svg+xml',
            'Content-Disposition': 'attachment; filename="mi-qr.svg"',
            'Cache-Control': NO_CACHE,
        });
        res.send(svg);
    }
}