// src/modules/reports/psychology-report/psychology-report.controller.ts
import {
    Controller, Get, Param, ParseUUIDPipe,
    UseGuards, Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { PsychologyReportService } from './psychology-report.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';

@Controller('reports/psychology')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PsychologyReportController {

    constructor(private readonly service: PsychologyReportService) { }

    @Get('informes/:id/pdf')
    @Roles('psicologa')
    async downloadInformePdf(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Res() res: Response,
    ): Promise<void> {
        const { buffer, filename } = await this.service.generateInformePdf(
            user.id,
            id,
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        );
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    }
    @Get('informes/:id/pdf/preview')
    @Roles('psicologa')
    async previewInformePdf(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Res() res: Response,
    ): Promise<void> {
        const { buffer, filename } = await this.service.generateInformePdf(
            user.id,
            id,
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${filename}"`,
        );
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    }
}