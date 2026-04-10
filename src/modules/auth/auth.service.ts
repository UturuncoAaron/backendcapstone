import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto.js';
import { User } from '../users/entities/user.entity.js';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly jwtService: JwtService,
    ) { }

    async login(dto: LoginDto) {
        // 1. Buscar usuario activo por tipo + número de documento
        const user = await this.userRepo.findOne({
            where: {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                activo: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Documento o contraseña incorrectos');
        }

        // 2. Verificar contraseña con bcrypt
        const passwordOk = await bcrypt.compare(dto.password, user.password_hash);
        if (!passwordOk) {
            throw new UnauthorizedException('Documento o contraseña incorrectos');
        }

        // 3. Generar JWT
        const payload = {
            sub: user.id,
            tipo_documento: user.tipo_documento,
            numero_documento: user.numero_documento,
            rol: user.rol,
        };

        return {
            token: this.jwtService.sign(payload),
            user: this.sanitizeUser(user),
        };
    }

    async getProfile(userId: string) {
        const user = await this.userRepo.findOne({
            where: { id: userId, activo: true },
        });

        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        return this.sanitizeUser(user);
    }

    // Elimina password_hash de la respuesta
    private sanitizeUser(user: User) {
        const { password_hash, ...safe } = user as any;
        return safe;
    }
}