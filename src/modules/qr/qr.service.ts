import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as QRCode from 'qrcode';

const QR_TYPE = 'qr_attendance' as const;
type QrType = typeof QR_TYPE;

interface QrAttendancePayload {
    sub: string;          // alumno_id
    type: QrType;
    iat?: number;
}

const QR_BASE = {
    errorCorrectionLevel: 'M' as const,
    margin: 2,
};

@Injectable()
export class QrService {
    private readonly logger = new Logger(QrService.name);

    constructor(private readonly jwt: JwtService) { }
    signAttendanceToken(alumnoId: string): string {
        return this.jwt.sign(
            { sub: alumnoId, type: QR_TYPE },
            { expiresIn: '100y' },
        );
    }

    async generatePng(alumnoId: string): Promise<Buffer> {
        const token = this.signAttendanceToken(alumnoId);
        return QRCode.toBuffer(token, { ...QR_BASE, width: 400 });
    }
    async generateSvg(alumnoId: string): Promise<string> {
        const token = this.signAttendanceToken(alumnoId);
        return QRCode.toString(token, { ...QR_BASE, type: 'svg' });
    }

    verifyAttendanceToken(token: string): { alumnoId: string } | null {
        try {
            const payload = this.jwt.verify<QrAttendancePayload>(token);
            if (payload?.type !== QR_TYPE || !payload.sub) {
                this.logger.warn('QR rechazado: payload inválido');
                return null;
            }
            return { alumnoId: payload.sub };
        } catch (err) {
            this.logger.warn(`QR rechazado: ${(err as Error).message}`);
            return null;
        }
    }
}