import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  rol: string;
  tipo_documento: string;
  numero_documento: string;
}

/**
 * Extractor que acepta token desde Authorization: Bearer o desde ?token=.
 * El query param es necesario para el stream SSE de notificaciones, ya que
 * EventSource (API nativa del navegador) no permite enviar headers custom.
 */
const fromHeaderOrQuery: JwtFromRequestFunction = (req: Request) => {
  const auth = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (auth) return auth;
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0)
    return queryToken;
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    @InjectRepository(Cuenta)
    private readonly cuentaRepo: Repository<Cuenta>,
  ) {
    super({
      jwtFromRequest: fromHeaderOrQuery,
      ignoreExpiration: false,
      secretOrKey: cfg.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const cuenta = await this.cuentaRepo.findOne({
      where: { id: payload.sub, activo: true },
    });

    if (!cuenta) {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }

    // Lo que queda disponible en @CurrentUser() y request.user
    // Exponemos `id` y `sub` (alias) para compatibilidad con todos los módulos:
    // unos usan user.id (psychology, announcements) y otros user.sub (assists, tasks, permissions).
    return {
      id: cuenta.id,
      sub: cuenta.id,
      rol: cuenta.rol,
      tipo_documento: cuenta.tipo_documento,
      numero_documento: cuenta.numero_documento,
    };
  }
}
