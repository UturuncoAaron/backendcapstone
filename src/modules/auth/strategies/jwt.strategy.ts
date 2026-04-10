import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

export interface JwtPayload {
    sub: string;
    tipo_documento: string;
    numero_documento: string;
    rol: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        cfg: ConfigService,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: cfg.get<string>('JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload) {
        const user = await this.userRepo.findOne({
            where: { id: payload.sub, activo: true },
        });

        if (!user) {
            throw new UnauthorizedException('Token inválido o usuario inactivo');
        }
        return {
            sub: user.id,
            nombre: user.nombre,
            apellido_paterno: user.apellido_paterno,
            tipo_documento: user.tipo_documento,
            numero_documento: user.numero_documento,
            rol: user.rol,
        };
    }
}