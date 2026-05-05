import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { QrService } from './qr.service';

/**
 * Endpoints para que el ADMIN descargue el QR del alumno
 * (PNG/SVG para imprimir, JSON para integraciones/debug).
 *
 * El QR codifica un JWT estable (sub = alumno_id) que el auxiliar verifica
 * al escanear.
 */
@Controller('admin/users/alumnos/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class QrController {
    constructor(private readonly qr: QrService) { }

    /** PNG — para descargar e imprimir en el carnet/agenda escolar. */
    @Get('qr.png')
    async getPng(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Res() res: Response,
    ): Promise<void> {
        const buffer = await this.qr.generatePng(id);
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `inline; filename="qr-${id}.png"`,
            'Cache-Control': 'private, max-age=3600',
        });
        res.send(buffer);
    }

    /** SVG — escala sin perder calidad para impresos grandes / PDFs. */
    @Get('qr.svg')
    async getSvg(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Res() res: Response,
    ): Promise<void> {
        const svg = await this.qr.generateSvg(id);
        res.set({
            'Content-Type': 'image/svg+xml',
            'Content-Disposition': `inline; filename="qr-${id}.svg"`,
            'Cache-Control': 'private, max-age=3600',
        });
        res.send(svg);
    }

    /** JSON — devuelve el JWT crudo (debug / integración). */
    @Get('qr.json')
    getJson(@Param('id', new ParseUUIDPipe()) id: string) {
        return {
            alumno_id: id,
            token: this.qr.signAttendanceToken(id),
        };
    }
}