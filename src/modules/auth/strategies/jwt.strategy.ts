import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import type { AuthUser, Rol } from '../types/auth-user.js';

export interface JwtPayload {
    sub: string;
    rol: string;
    tipo_documento: string;
    numero_documento: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        cfg: ConfigService,
        @InjectRepository(Cuenta)
        private readonly cuentaRepo: Repository<Cuenta>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: cfg.get<string>('JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload): Promise<AuthUser> {
        const cuenta = await this.cuentaRepo.findOne({
            where: { id: payload.sub, activo: true },
        });

        if (!cuenta) {
            throw new UnauthorizedException('Token inválido o usuario inactivo');
        }

        // Forma canónica de request.user en toda la app: usar AuthUser.
        return {
            id: cuenta.id,
            rol: cuenta.rol as Rol,
            tipo_documento: cuenta.tipo_documento,
            numero_documento: cuenta.numero_documento,
        };
    }
}
