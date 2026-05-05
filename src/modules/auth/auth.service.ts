// Ubicación en tu proyecto: src/modules/auth/auth.service.ts
// Cambios vs tu versión actual:
//   1. Inyecta Section repo para detectar secciones tutoreadas.
//   2. Helper computeModulos() arma la lista de módulos según rol + es_tutor_de.
//   3. login() y getProfile() devuelven { ...perfil, rol, modulos[], es_tutor_de[] }.
// Todo lo demás queda igual.

import {
    Injectable, UnauthorizedException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { LoginDto, ChangePasswordDto } from './dto/login.dto.js';
import { UsersService } from '../users/users.service.js';
import { Section } from '../academic/entities/section.entity.js';
import { getModulosBasePorRol, MODULOS, type Modulo } from './constants/modulos.js';

interface SeccionTutorada {
    id: string;
    nombre: string;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        @InjectRepository(Section)
        private readonly sectionRepo: Repository<Section>,
    ) { }

    async login(dto: LoginDto) {
        const input = (dto.codigo_acceso ?? '').trim();
        if (!input) {
            throw new UnauthorizedException('Código de acceso o contraseña incorrectos');
        }

        // 1. Buscar por codigo_acceso (uppercase) — ej. EST-12345678 / AUX-44444444
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

        const [perfilEnriquecido, token] = await Promise.all([
            this.buildPerfilEnriquecido(cuenta.id, cuenta.rol),
            Promise.resolve(this.jwtService.sign(payload)),
        ]);

        setImmediate(() => {
            this.usersService.updateUltimoAcceso(cuenta.id).catch(() => null);
        });

        this.logger.log(`Login OK: ${cuenta.codigo_acceso ?? cuenta.numero_documento} (rol=${cuenta.rol})`);

        return {
            token,
            password_changed: cuenta.password_changed,
            user: perfilEnriquecido,
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

        return this.buildPerfilEnriquecido(cuenta.id, cuenta.rol, cuenta.password_changed);
    }
    private async buildPerfilEnriquecido(
        id: string,
        rol: string,
        passwordChanged?: boolean,
    ) {
        const [perfil, esTutorDe] = await Promise.all([
            this.usersService.getProfileById(id, rol),
            rol === 'docente' ? this.findSeccionesTutoreadas(id) : Promise.resolve<SeccionTutorada[]>([]),
        ]);

        if (!perfil) throw new UnauthorizedException('Rol no reconocido');

        const modulos = this.computeModulos(rol, esTutorDe);

        return {
            ...perfil,
            rol,
            ...(passwordChanged !== undefined ? { password_changed: passwordChanged } : {}),
            es_tutor_de: esTutorDe,
            modulos,
        };
    }
    private async findSeccionesTutoreadas(docenteId: string): Promise<SeccionTutorada[]> {
        const secciones = await this.sectionRepo
            .createQueryBuilder('s')
            .select(['s.id AS id', 's.nombre AS nombre'])
            .where('s.tutor_id = :id', { id: docenteId })
            .orderBy('s.nombre', 'ASC')
            .getRawMany();
        return secciones;
    }
    private computeModulos(rol: string, esTutorDe: SeccionTutorada[]): Modulo[] {
        const base = getModulosBasePorRol(rol);
        const extras: Modulo[] = [];

        if (rol === 'docente' && esTutorDe.length > 0) {
            extras.push(MODULOS.TUTORIA, MODULOS.ASIST_GENERAL);
        }
        return Array.from(new Set([...base, ...extras]));
    }
}