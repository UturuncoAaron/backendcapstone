import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { LoginDto } from './dto/login.dto.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly dataSource: DataSource,
    ) { }

    async login(dto: LoginDto) {
        // 1. Buscar cuenta activa por documento
        const cuenta = await this.usersService.findCuentaByDocumento(
            dto.tipo_documento,
            dto.numero_documento,
        );

        if (!cuenta) {
            throw new UnauthorizedException('Documento o contraseña incorrectos');
        }

        // 2. Verificar contraseña
        const passwordOk = await bcrypt.compare(dto.password, cuenta.password_hash);
        if (!passwordOk) {
            throw new UnauthorizedException('Documento o contraseña incorrectos');
        }

        // 3. Actualizar ultimo_acceso en background (no bloquea la respuesta)
        this.usersService.updateUltimoAcceso(cuenta.id).catch(() => null);

        // 4. Obtener perfil según rol
        const perfil = await this.getPerfil(cuenta.id, cuenta.rol);

        // 5. Generar JWT
        const payload = {
            sub: cuenta.id,
            rol: cuenta.rol,
            tipo_documento: cuenta.tipo_documento,
            numero_documento: cuenta.numero_documento,
        };

        return {
            token: this.jwtService.sign(payload),
            user: perfil,
        };
    }

    async getProfile(userId: string) {
        const cuenta = await this.usersService.findCuentaById(userId);
        if (!cuenta || !cuenta.activo) {
            throw new UnauthorizedException('Usuario no encontrado o inactivo');
        }
        return this.getPerfil(cuenta.id, cuenta.rol);
    }

    // Devuelve el perfil de la tabla correspondiente al rol usando los repositorios
    private async getPerfil(id: string, rol: string) {
        let perfil: unknown;
        switch (rol) {
            case 'alumno':  perfil = await this.usersService.findAlumnoById(id);  break;
            case 'docente': perfil = await this.usersService.findDocenteById(id); break;
            case 'padre':   perfil = await this.usersService.findPadreById(id);   break;
            case 'admin':   perfil = await this.usersService.findAdminById(id);   break;
            default:        throw new UnauthorizedException('Rol no reconocido');
        }
        return { ...(perfil as object), rol };
    }
}