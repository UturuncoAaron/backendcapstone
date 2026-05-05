import {
    Injectable, UnauthorizedException, BadRequestException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { LoginDto, ChangePasswordDto } from './dto/login.dto.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) { }

    async login(dto: LoginDto) {
        const input = (dto.codigo_acceso ?? '').trim();
        if (!input) {
            throw new UnauthorizedException('Código de acceso o contraseña incorrectos');
        }

        // 1. Buscar por codigo_acceso (uppercase) — ej. EST-12345678
        let cuenta = await this.usersService.findCuentaByCodigoAcceso(input.toUpperCase());
        if (!cuenta) {
            cuenta = await this.usersService.findCuentaByNumeroDocumento(input);
        }

        if (!cuenta) {
            this.logger.warn(`Login fallido: código no encontrado (input="${input}")`);
            throw new UnauthorizedException('Código de acceso o contraseña incorrectos');
        }

        if (!cuenta.activo) {
            this.logger.warn(`Login fallido: cuenta inactiva (id=${cuenta.id})`);
            throw new UnauthorizedException('Cuenta inactiva. Contacta al administrador.');
        }

        const passwordOk = await bcrypt.compare(dto.password, cuenta.password_hash);
        if (!passwordOk) {
            this.logger.warn(`Login fallido: password incorrecto (id=${cuenta.id})`);
            throw new UnauthorizedException('Código de acceso o contraseña incorrectos');
        }

        const payload = {
            sub: cuenta.id,
            rol: cuenta.rol,
            codigo_acceso: cuenta.codigo_acceso,
            password_changed: cuenta.password_changed,
        };

        const [perfil, token] = await Promise.all([
            this.getPerfil(cuenta.id, cuenta.rol),
            Promise.resolve(this.jwtService.sign(payload)),
        ]);

        setImmediate(() => {
            this.usersService.updateUltimoAcceso(cuenta.id).catch(() => null);
        });

        this.logger.log(`Login OK: ${cuenta.codigo_acceso ?? cuenta.numero_documento} (rol=${cuenta.rol})`);

        return {
            token,
            password_changed: cuenta.password_changed,
            user: { ...perfil, rol: cuenta.rol },
        };
    }

    async changePassword(userId: string, dto: ChangePasswordDto) {
        const cuenta = await this.usersService.findCuentaById(userId);
        if (!cuenta || !cuenta.activo) throw new UnauthorizedException('Cuenta no encontrada');

        const isSame = await bcrypt.compare(dto.new_password, cuenta.password_hash);
        if (isSame) throw new BadRequestException('La nueva contraseña no puede ser igual a tu número de documento actual');

        const newHash = await bcrypt.hash(dto.new_password, 10);
        await this.usersService.updatePassword(userId, newHash);

        return { message: 'Contraseña actualizada correctamente' };
    }

    async getProfile(userId: string) {
        const cuenta = await this.usersService.findCuentaById(userId);
        if (!cuenta || !cuenta.activo) throw new UnauthorizedException('Usuario no encontrado o inactivo');

        const perfil = await this.getPerfil(cuenta.id, cuenta.rol);
        return {
            ...perfil,
            rol: cuenta.rol,
            password_changed: cuenta.password_changed,
        };
    }

    private async getPerfil(id: string, rol: string) {
        const perfil = await this.usersService.getProfileById(id, rol);
        if (!perfil) throw new UnauthorizedException('Rol no reconocido');
        return perfil;
    }
}