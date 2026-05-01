import {
    Injectable, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { LoginDto, ChangePasswordDto } from './dto/login.dto.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) { }

    async login(dto: LoginDto) {
        const cuenta = await this.usersService.findCuentaByCodigoAcceso(
            dto.codigo_acceso.trim().toUpperCase(),
        );
        if (!cuenta) throw new UnauthorizedException('Código de acceso o contraseña incorrectos');

        // 2. Verificar password — bcrypt rounds=10
        const passwordOk = await bcrypt.compare(dto.password, cuenta.password_hash);
        if (!passwordOk) throw new UnauthorizedException('Código de acceso o contraseña incorrectos');

        // 3. Perfil + JWT en paralelo
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

        // 4. Actualizar último acceso en background
        setImmediate(() => {
            this.usersService.updateUltimoAcceso(cuenta.id).catch(() => null);
        });

        return {
            token,
            password_changed: cuenta.password_changed,
            user: { ...perfil, rol: cuenta.rol },
        };
    }

    async changePassword(userId: string, dto: ChangePasswordDto) {
        const cuenta = await this.usersService.findCuentaById(userId);
        if (!cuenta || !cuenta.activo) {
            throw new UnauthorizedException('Cuenta no encontrada');
        }

        // Verificar contraseña actual
        const passwordOk = await bcrypt.compare(dto.current_password, cuenta.password_hash);
        if (!passwordOk) throw new BadRequestException('La contraseña actual es incorrecta');

        // No permitir que la nueva sea igual a la actual
        const isSame = await bcrypt.compare(dto.new_password, cuenta.password_hash);
        if (isSame) throw new BadRequestException('La nueva contraseña no puede ser igual a la actual');

        // Actualizar password y marcar como cambiada
        const newHash = await bcrypt.hash(dto.new_password, 10);
        await this.usersService.updatePassword(userId, newHash);

        return { message: 'Contraseña actualizada correctamente' };
    }

    async getProfile(userId: string) {
        const cuenta = await this.usersService.findCuentaById(userId);
        if (!cuenta || !cuenta.activo) {
            throw new UnauthorizedException('Usuario no encontrado o inactivo');
        }
        const perfil = await this.getPerfil(cuenta.id, cuenta.rol);
        return {
            ...perfil,
            rol: cuenta.rol,
            password_changed: cuenta.password_changed,
        };
    }

    private async getPerfil(id: string, rol: string) {
        switch (rol) {
            case 'alumno': return this.usersService.findAlumnoById(id);
            case 'docente': return this.usersService.findDocenteById(id);
            case 'padre': return this.usersService.findPadreById(id);
            case 'admin': return this.usersService.findAdminById(id);
            case 'psicologa': return this.usersService.findPsicologaById(id);
            default: throw new UnauthorizedException('Rol no reconocido');
        }
    }
}