import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

import { Cuenta } from '../users/entities/cuenta.entity.js';
import { UsersModule } from '../users/users.module.js';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),

        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => ({
                secret: cfg.get<string>('JWT_SECRET'),
                signOptions: {
                    expiresIn: (cfg.get<string>('JWT_EXPIRES') ?? '8h') as any,
                },
            }),
        }),

        TypeOrmModule.forFeature([Cuenta]),
        UsersModule,
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
    exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule { }