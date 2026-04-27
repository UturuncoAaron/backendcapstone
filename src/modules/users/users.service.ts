import {
    Injectable, NotFoundException,
    ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { Cuenta } from './entities/cuenta.entity.js';
import { Alumno } from './entities/alumno.entity.js';
import { Docente } from './entities/docente.entity.js';
import { Padre } from './entities/padre.entity.js';
import { Admin } from './entities/admin.entity.js';

import {
    CreateAlumnoDto,
    CreateDocenteDto,
    CreatePadreDto,
    CreateAdminDto,
    LinkPadreAlumnoDto,
} from './dto/users.dto.js';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(Cuenta) private cuentaRepo: Repository<Cuenta>,
        @InjectRepository(Alumno) private alumnoRepo: Repository<Alumno>,
        @InjectRepository(Docente) private docenteRepo: Repository<Docente>,
        @InjectRepository(Padre) private padreRepo: Repository<Padre>,
        @InjectRepository(Admin) private adminRepo: Repository<Admin>,
        private readonly dataSource: DataSource,
    ) { }

    // ── Helpers privados ─────────────────────────────────────────

    private async checkDocumentoUnico(tipo: string, numero: string) {
        const exists = await this.cuentaRepo.findOne({
            where: { tipo_documento: tipo as any, numero_documento: numero.trim() },
        });
        if (exists) throw new ConflictException(`Ya existe un usuario con ${tipo} ${numero}`);
    }

    // ── Crear usuarios por rol ────────────────────────────────────

    async createAlumno(dto: CreateAlumnoDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash, rol: 'alumno',
            }));
            return em.save(em.create(Alumno, {
                id: cuenta.id,
                codigo_estudiante: dto.codigo_estudiante,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : null,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            }));
        });
    }

    async createDocente(dto: CreateDocenteDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash, rol: 'docente',
            }));
            return em.save(em.create(Docente, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                especialidad: dto.especialidad ?? null,
                titulo_profesional: dto.titulo_profesional ?? null,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            }));
        });
    }

    async createPadre(dto: CreatePadreDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash, rol: 'padre',
            }));
            return em.save(em.create(Padre, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                relacion: dto.relacion as any,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            }));
        });
    }

    async createAdmin(dto: CreateAdminDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash, rol: 'admin',
            }));
            return em.save(em.create(Admin, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                cargo: dto.cargo ?? null,
                email: dto.email ?? null,
            }));
        });
    }

    // ── Listar por rol ────────────────────────────────────────────

    async findAdmins() {
        const admins = await this.adminRepo
            .createQueryBuilder('a')
            .leftJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id               AS id',
                'a.nombre           AS nombre',
                'a.apellido_paterno AS apellido_paterno',
                'a.apellido_materno AS apellido_materno',
                'a.cargo            AS cargo',
                'a.email            AS email',
                'a.created_at       AS created_at',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.activo           AS activo',
            ])
            .orderBy('a.apellido_paterno', 'ASC')
            .getRawMany();

        return admins;
    }


    // Reemplaza findAlumnos() en users.service.ts

    async findAlumnos() {
        // JOIN con matriculas → secciones → grados para obtener el grado actual
        const rows = await this.alumnoRepo
            .createQueryBuilder('a')
            .leftJoin('cuentas', 'c', 'c.id = a.id')
            .leftJoin(
                'matriculas', 'm',
                'm.alumno_id = a.id AND m.activo = true',
            )
            .leftJoin('secciones', 's', 's.id = m.seccion_id')
            .leftJoin('grados', 'g', 'g.id = s.grado_id')
            .select([
                'a.id                AS id',
                'a.codigo_estudiante AS codigo_estudiante',
                'a.nombre            AS nombre',
                'a.apellido_paterno  AS apellido_paterno',
                'a.apellido_materno  AS apellido_materno',
                'a.fecha_nacimiento  AS fecha_nacimiento',
                'a.telefono          AS telefono',
                'a.email             AS email',
                'c.numero_documento  AS numero_documento',
                'c.tipo_documento    AS tipo_documento',
                'c.activo            AS activo',
                "CONCAT(g.orden, '°') AS grado",
                's.nombre            AS seccion',
            ])
            .orderBy('a.apellido_paterno', 'ASC')
            .addOrderBy('a.nombre', 'ASC')
            .getRawMany();

        return rows;
    }

    async findDocentes() {
        return this.docenteRepo.find({
            order: { apellido_paterno: 'ASC', nombre: 'ASC' },
        });
    }

    async findPadres() {
        return this.padreRepo.find({
            order: { apellido_paterno: 'ASC', nombre: 'ASC' },
        });
    }
    // ── Buscar (autocomplete) ─────────────────────────────────────

    async searchAlumnos(query: string) {
        if (!query || query.trim().length < 2) return { data: [] };

        const rows = await this.alumnoRepo
            .createQueryBuilder('a')
            .leftJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id                AS id',
                'a.nombre            AS nombre',
                'a.apellido_paterno  AS apellido_paterno',
                'a.apellido_materno  AS apellido_materno',
                'a.codigo_estudiante AS codigo_estudiante',
                'c.numero_documento  AS numero_documento',
            ])
            .where(
                'a.nombre ILIKE :q OR a.apellido_paterno ILIKE :q OR c.numero_documento ILIKE :q OR a.codigo_estudiante ILIKE :q',
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();

        return { data: rows };
    }

    async searchDocentes(query: string) {
        if (!query || query.trim().length < 2) return { data: [] };

        const rows = await this.docenteRepo
            .createQueryBuilder('d')
            .leftJoin('cuentas', 'c', 'c.id = d.id')
            .select([
                'd.id               AS id',
                'd.nombre           AS nombre',
                'd.apellido_paterno AS apellido_paterno',
                'd.apellido_materno AS apellido_materno',
                'd.especialidad     AS especialidad',
                'c.numero_documento AS numero_documento',
            ])
            .where(
                'd.nombre ILIKE :q OR d.apellido_paterno ILIKE :q OR c.numero_documento ILIKE :q',
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();

        return { data: rows };
    }

    async searchPadres(query: string) {
        if (!query || query.trim().length < 2) return { data: [] };

        const rows = await this.padreRepo
            .createQueryBuilder('p')
            .leftJoin('cuentas', 'c', 'c.id = p.id')
            .select([
                'p.id               AS id',
                'p.nombre           AS nombre',
                'p.apellido_paterno AS apellido_paterno',
                'p.apellido_materno AS apellido_materno',
                'p.relacion         AS relacion',
                'c.numero_documento AS numero_documento',
            ])
            .where(
                'p.nombre ILIKE :q OR p.apellido_paterno ILIKE :q OR c.numero_documento ILIKE :q',
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();

        return { data: rows };
    }

    // ── Obtener uno ───────────────────────────────────────────────

    async findAlumnoById(id: string) {
        const alumno = await this.alumnoRepo.findOne({ where: { id } });
        if (!alumno) throw new NotFoundException(`Alumno ${id} no encontrado`);
        return alumno;
    }

    async findDocenteById(id: string) {
        const docente = await this.docenteRepo.findOne({ where: { id } });
        if (!docente) throw new NotFoundException(`Docente ${id} no encontrado`);
        return docente;
    }

    // ── Desactivar cuenta ─────────────────────────────────────────

    async deactivate(id: string): Promise<{ message: string }> {
        const cuenta = await this.cuentaRepo.findOne({ where: { id, activo: true } });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);
        cuenta.activo = false;
        await this.cuentaRepo.save(cuenta);
        return { message: 'Usuario desactivado correctamente' };
    }

    // ── Reset de contraseña ───────────────────────────────────────

    async resetPassword(id: string, newPassword: string): Promise<{ message: string }> {
        if (newPassword.length < 6)
            throw new BadRequestException('La contraseña debe tener mínimo 6 caracteres');

        const cuenta = await this.cuentaRepo.findOne({ where: { id, activo: true } });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);

        cuenta.password_hash = await bcrypt.hash(newPassword, 12);
        await this.cuentaRepo.save(cuenta);
        return { message: 'Contraseña actualizada correctamente' };
    }

    // ── Vincular padre ↔ alumno ───────────────────────────────────

    async linkPadreAlumno(dto: LinkPadreAlumnoDto) {
        const padre = await this.padreRepo
            .createQueryBuilder('p')
            .innerJoin('cuentas', 'c', 'c.id = p.id AND c.activo = true')
            .where('c.numero_documento = :doc', { doc: dto.padre_doc })
            .getOne();
        if (!padre) throw new NotFoundException(`No se encontró padre con documento ${dto.padre_doc}`);

        const alumno = await this.alumnoRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id AND c.activo = true')
            .where('c.numero_documento = :doc', { doc: dto.alumno_doc })
            .getOne();
        if (!alumno) throw new NotFoundException(`No se encontró alumno con documento ${dto.alumno_doc}`);

        const existing = await this.dataSource.query(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2`,
            [padre.id, alumno.id],
        );
        if (existing.length) throw new ConflictException('Este vínculo ya existe');

        await this.dataSource.query(
            `INSERT INTO padre_alumno (padre_id, alumno_id) VALUES ($1, $2)`,
            [padre.id, alumno.id],
        );

        return {
            padre: `${padre.nombre} ${padre.apellido_paterno}`,
            alumno: `${alumno.nombre} ${alumno.apellido_paterno}`,
        };
    }

    // ── Stats para dashboard admin ────────────────────────────────

    async getStats() {
        const [alumnos, docentes, padres, admins, cursosRaw] = await Promise.all([
            this.alumnoRepo.count(),
            this.docenteRepo.count(),
            this.padreRepo.count(),
            this.adminRepo.count(),
            this.dataSource.query(`SELECT COUNT(*) FROM cursos WHERE activo = true`),
        ]);

        return {
            alumnos,
            docentes,
            padres,
            admins,
            cursos: parseInt(cursosRaw[0].count),
        };
    }


    // ── Usado por AuthService ─────────────────────────────────────

    async findCuentaByDocumento(tipo: string, numero: string): Promise<Cuenta | null> {
        return this.cuentaRepo.findOne({
            where: {
                tipo_documento: tipo as any,
                numero_documento: numero.trim(),
                activo: true,
            },
        });
    }

    async updateUltimoAcceso(id: string) {
        await this.cuentaRepo.update(id, { ultimo_acceso: new Date() });
    }

}