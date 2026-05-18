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
import { PermissionsService } from '../permissions/permissions.service.js';
import { getModulosBasePorRol, MODULOS, type Modulo } from './constants/modulos.js';

interface SeccionTutorada {
    id: string;
    nombre: string;
}

// ── Mapeo permiso_extra → módulo JWT ─────────────────────────────────────────
// Cuando el admin otorga uno de estos permisos, el módulo correspondiente
// se inyecta en el JWT al próximo login. Agregar aquí si crece el sistema.
const PERMISO_A_MODULO: Array<{
    modulo: string;
    accion: string;
    modulo_jwt: Modulo;
}> = [
        {
            modulo: 'reportes',
            accion: 'ver_todos',
            modulo_jwt: MODULOS.REPORTES_ACCESO,
        },
        {
            modulo: 'libretas',
            accion: 'subir_padre',
            modulo_jwt: MODULOS.LIBRETAS_PADRE_ACCESO,
        },
    ];

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly permissionsService: PermissionsService,
        @InjectRepository(Section)
        private readonly sectionRepo: Repository<Section>,
    ) { }

    async login(dto: LoginDto) {
        const input = (dto.codigo_acceso ?? '').trim();
        if (!input) {
            throw new UnauthorizedException('Código de acceso o contraseña incorrectos');
        }

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
        const rolesConPermisosExtra = ['docente', 'psicologa'];

        const [perfil, esTutorDe, permisosExtra] = await Promise.all([
            this.usersService.getProfileById(id, rol),
            rol === 'docente'
                ? this.findSeccionesTutoreadas(id)
                : Promise.resolve<SeccionTutorada[]>([]),
            rolesConPermisosExtra.includes(rol)
                ? this.permissionsService.findByCuenta(id)
                : Promise.resolve([]),
        ]);

        if (!perfil) throw new UnauthorizedException('Rol no reconocido');

        const modulos = this.computeModulos(rol, esTutorDe, permisosExtra);

        return {
            ...perfil,
            rol,
            ...(passwordChanged !== undefined ? { password_changed: passwordChanged } : {}),
            es_tutor_de: esTutorDe,
            modulos,
        };
    }

    private async findSeccionesTutoreadas(docenteId: string): Promise<SeccionTutorada[]> {
        return this.sectionRepo
            .createQueryBuilder('s')
            .select(['s.id AS id', 's.nombre AS nombre'])
            .where('s.tutor_id = :id', { id: docenteId })
            .orderBy('s.nombre', 'ASC')
            .getRawMany();
    }

    private computeModulos(
        rol: string,
        esTutorDe: SeccionTutorada[],
        permisosExtra: Array<{ modulo: string; accion: string }>,
    ): Modulo[] {
        const base = getModulosBasePorRol(rol);
        const extras: Modulo[] = [];

        // Módulos por condición de negocio
        if (rol === 'docente' && esTutorDe.length > 0) {
            extras.push(MODULOS.TUTORIA, MODULOS.ASIST_GENERAL);
        }

        // Módulos derivados de permisos extra
        for (const { modulo, accion, modulo_jwt } of PERMISO_A_MODULO) {
            const tiene = permisosExtra.some(
                p => p.modulo === modulo && p.accion === accion,
            );
            if (tiene) extras.push(modulo_jwt);
        }

        return Array.from(new Set([...base, ...extras]));
    }
}