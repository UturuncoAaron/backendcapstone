import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as QRCode from 'qrcode';

const QR_TYPE = 'qr_attendance' as const;

export interface QrAttendancePayload {
    sub: string;
    type: typeof QR_TYPE;
    iat?: number;
}

const QR_OPTIONS = {
    errorCorrectionLevel: 'M' as const,
    margin: 2,
    width: 500,
} as const;

@Injectable()
export class QrService {
    private readonly logger = new Logger(QrService.name);

    constructor(private readonly jwt: JwtService) { }

    /**
     * Firma el JWT embebido en el QR.
     * Sin expiresIn — la vigencia se controla con cuentas.activo en DB.
     */
    signAttendanceToken(alumnoId: string): string {
        return this.jwt.sign({ sub: alumnoId, type: QR_TYPE });
    }

    /** PNG 500×500 px — resolución óptima para impresión en carnet A4. */
    generatePng(alumnoId: string): Promise<Buffer> {
        return QRCode.toBuffer(
            this.signAttendanceToken(alumnoId),
            QR_OPTIONS,
        );
    }

    /** SVG vectorial — escala sin pérdida para cualquier tamaño de impresión. */
    generateSvg(alumnoId: string): Promise<string> {
        return QRCode.toString(
            this.signAttendanceToken(alumnoId),
            { ...QR_OPTIONS, type: 'svg' },
        );
    }

    verifyAttendanceToken(token: string): { alumnoId: string } | null {
        try {
            const payload = this.jwt.verify<QrAttendancePayload>(token);
            if (payload?.type !== QR_TYPE || !payload.sub) {
                this.logger.warn('QR rechazado: payload inválido o tipo incorrecto');
                return null;
            }
            return { alumnoId: payload.sub };
        } catch (err) {
            this.logger.warn(`QR rechazado: ${(err as Error).message}`);
            return null;
        }
    }
}