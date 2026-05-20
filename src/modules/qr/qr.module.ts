import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QrController } from './qr.controller.js';
import { QrService } from './qr.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
    imports: [
        AuthModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => ({
                secret: cfg.get<string>('JWT_SECRET'),
            }),
        }),
    ],
    controllers: [QrController],
    providers: [QrService],
    exports: [QrService],
})
export class QrModule { }