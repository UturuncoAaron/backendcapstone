import {
    Injectable, NotFoundException,
    ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { Cuenta } from './entities/cuenta.entity.js';
import { Alumno } from './entities/alumno.entity.js';
import { Docente } from './entities/docente.entity.js';
import { Padre } from './entities/padre.entity.js';
import { Admin } from './entities/admin.entity.js';
import { StorageService } from '../storage/storage.service.js';

import {
    CreateAlumnoDto,
    CreateDocenteDto,
    CreatePadreDto,
    CreateAdminDto,
    CreatePsicologaDto,
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
        private readonly storageService: StorageService,
    ) { }

    // ════════════════════════════════════════════════════════════
    // HELPERS PRIVADOS
    // ════════════════════════════════════════════════════════════

    private async checkDocumentoUnico(tipo: string, numero: string) {
        const exists = await this.cuentaRepo.findOne({
            where: { tipo_documento: tipo as any, numero_documento: numero.trim() },
        });
        if (exists) throw new ConflictException(`Ya existe un usuario con ${tipo} ${numero}`);
    }

    private generateCodigoAcceso(rol: string, dni: string): string {
        const prefixes: Record<string, string> = {
            alumno: 'EST',
            docente: 'DOC',
            padre: 'PAD',
            admin: 'ADM',
            psicologa: 'PSI',
        };
        const prefix = prefixes[rol] ?? 'USR';
        return `${prefix}-${dni.trim()}`;
    }

    // ════════════════════════════════════════════════════════════
    // CREAR USUARIOS
    // ════════════════════════════════════════════════════════════

    async createAlumno(dto: CreateAlumnoDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const dni = dto.numero_documento.trim();
            const password_hash = await bcrypt.hash(dni, 10);
            const codigo_acceso = this.generateCodigoAcceso('alumno', dni);

            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dni,
                password_hash,
                codigo_acceso,
                password_changed: false,
                rol: 'alumno',
            }));

            return em.save(em.create(Alumno, {
                id: cuenta.id,
                codigo_estudiante: dto.codigo_estudiante ?? `EST-${dni}`,
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
            const dni = dto.numero_documento.trim();
            const password_hash = await bcrypt.hash(dni, 10);
            const codigo_acceso = this.generateCodigoAcceso('docente', dni);

            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dni,
                password_hash,
                codigo_acceso,
                password_changed: false,
                rol: 'docente',
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
            const dni = dto.numero_documento.trim();
            const password_hash = await bcrypt.hash(dni, 10);
            const codigo_acceso = this.generateCodigoAcceso('padre', dni);

            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dni,
                password_hash,
                codigo_acceso,
                password_changed: false,
                rol: 'padre',
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

    async createPsicologa(dto: CreatePsicologaDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const dni = dto.numero_documento.trim();
            const password_hash = await bcrypt.hash(dni, 10);
            const codigo_acceso = this.generateCodigoAcceso('psicologa', dni);

            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dni,
                password_hash,
                codigo_acceso,
                password_changed: false,
                rol: 'psicologa' as any,
            }));

            await em.query(
                `INSERT INTO psicologas
                    (id, nombre, apellido_paterno, apellido_materno,
                     especialidad, colegiatura, email, telefono)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    cuenta.id,
                    dto.nombre,
                    dto.apellido_paterno,
                    dto.apellido_materno ?? null,
                    dto.especialidad ?? null,
                    dto.colegiatura ?? null,
                    dto.email ?? null,
                    dto.telefono ?? null,
                ],
            );

            return {
                id: cuenta.id,
                codigo_acceso,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                especialidad: dto.especialidad ?? null,
                colegiatura: dto.colegiatura ?? null,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            };
        });
    }

    async createAdmin(dto: CreateAdminDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const dni = dto.numero_documento.trim();
            const password_hash = await bcrypt.hash(dni, 10);
            const codigo_acceso = this.generateCodigoAcceso('admin', dni);

            const cuenta = await em.save(em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dni,
                password_hash,
                codigo_acceso,
                password_changed: false,
                rol: 'admin',
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

    // ════════════════════════════════════════════════════════════
    // LISTAR POR ROL
    // ════════════════════════════════════════════════════════════

    async findAdmins() {
        return this.adminRepo
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
                'c.codigo_acceso    AS codigo_acceso',
                'c.activo           AS activo',
            ])
            .orderBy('a.apellido_paterno', 'ASC')
            .getRawMany();
    }

    async findAlumnos() {
        return this.alumnoRepo
            .createQueryBuilder('a')
            .leftJoin('cuentas', 'c', 'c.id = a.id')
            .leftJoin('matriculas', 'm', 'm.alumno_id = a.id AND m.activo = true')
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
                'c.codigo_acceso     AS codigo_acceso',
                'c.activo            AS activo',
                "CONCAT(g.orden, '°') AS grado",
                's.nombre            AS seccion',
            ])
            .orderBy('a.apellido_paterno', 'ASC')
            .addOrderBy('a.nombre', 'ASC')
            .getRawMany();
    }

    async findDocentes(includeTutoria = false) {
        if (!includeTutoria) {
            return this.docenteRepo.find({
                order: { apellido_paterno: 'ASC', nombre: 'ASC' },
            });
        }

        return this.docenteRepo
            .createQueryBuilder('d')
            .leftJoin('secciones', 's', 's.tutor_id = d.id')
            .leftJoin('grados', 'g', 'g.id = s.grado_id')
            .select([
                'd.id               AS id',
                'd.nombre           AS nombre',
                'd.apellido_paterno AS apellido_paterno',
                'd.apellido_materno AS apellido_materno',
                'd.especialidad     AS especialidad',
                `CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'seccion_id',    s.id,
                    'seccion_label', g.nombre || ' Sección ' || s.nombre
                ) END AS tutoria_actual`,
            ])
            .orderBy('d.apellido_paterno', 'ASC')
            .addOrderBy('d.nombre', 'ASC')
            .getRawMany();
    }

    async findPadres() {
        return this.padreRepo
            .createQueryBuilder('p')
            .leftJoin('cuentas', 'c', 'c.id = p.id')
            .select([
                'p.id               AS id',
                'p.nombre           AS nombre',
                'p.apellido_paterno AS apellido_paterno',
                'p.apellido_materno AS apellido_materno',
                'p.relacion         AS relacion',
                'p.email            AS email',
                'p.telefono         AS telefono',
                'p.created_at       AS created_at',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.codigo_acceso    AS codigo_acceso',
                'c.activo           AS activo',
                'c.password_changed AS password_changed',
            ])
            .orderBy('p.apellido_paterno', 'ASC')
            .addOrderBy('p.nombre', 'ASC')
            .getRawMany();
    }

    // ════════════════════════════════════════════════════════════
    // BÚSQUEDAS
    // ════════════════════════════════════════════════════════════

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
                'c.codigo_acceso     AS codigo_acceso',
            ])
            .where(
                'a.nombre ILIKE :q OR a.apellido_paterno ILIKE :q OR c.numero_documento ILIKE :q OR a.codigo_estudiante ILIKE :q OR c.codigo_acceso ILIKE :q',
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
                'c.codigo_acceso    AS codigo_acceso',
            ])
            .where(
                'd.nombre ILIKE :q OR d.apellido_paterno ILIKE :q OR c.numero_documento ILIKE :q OR c.codigo_acceso ILIKE :q',
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
                'c.codigo_acceso    AS codigo_acceso',
            ])
            .where(
                'p.nombre ILIKE :q OR p.apellido_paterno ILIKE :q OR c.numero_documento ILIKE :q OR c.codigo_acceso ILIKE :q',
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();
        return { data: rows };
    }

    // ════════════════════════════════════════════════════════════
    // OBTENER UNO POR ID
    // ════════════════════════════════════════════════════════════

    async findAlumnoById(id: string) {
        const alumno = await this.alumnoRepo.findOne({
            where: { id },
            relations: ['cuenta'],
        });
        if (!alumno) throw new NotFoundException(`Alumno ${id} no encontrado`);
        return alumno;
    }

    async findDocenteById(id: string) {
        const docente = await this.docenteRepo.findOne({
            where: { id },
            relations: ['cuenta'],
        });
        if (!docente) throw new NotFoundException(`Docente ${id} no encontrado`);
        return docente;
    }

    async findPadreById(id: string) {
        const padre = await this.padreRepo.findOne({
            where: { id },
            relations: ['cuenta'],
        });
        if (!padre) throw new NotFoundException(`Padre ${id} no encontrado`);
        return padre;
    }

    async findAdminById(id: string) {
        const admin = await this.adminRepo.findOne({
            where: { id },
            relations: ['cuenta'],
        });
        if (!admin) throw new NotFoundException(`Admin ${id} no encontrado`);
        return admin;
    }

    async findPsicologaById(id: string) {
        const rows = await this.dataSource.query(
            `
            SELECT
                p.id,
                c.numero_documento,
                c.tipo_documento,
                c.codigo_acceso,
                p.nombre,
                p.apellido_paterno,
                p.apellido_materno,
                p.especialidad,
                p.colegiatura,
                p.email,
                p.telefono,
                p.foto_storage_key,
                c.activo,
                c.password_changed,
                jsonb_build_object(
                    'id',                p.id,
                    'numero_documento',  c.numero_documento,
                    'tipo_documento',    c.tipo_documento,
                    'codigo_acceso',     c.codigo_acceso,
                    'activo',            c.activo,
                    'password_changed',  c.password_changed
                ) AS cuenta
            FROM psicologas p
            INNER JOIN cuentas c ON c.id = p.id
            WHERE p.id = $1
            LIMIT 1
            `,
            [id],
        );
        if (!rows.length) throw new NotFoundException(`Psicóloga ${id} no encontrada`);
        return rows[0];
    }

    // ════════════════════════════════════════════════════════════
    // ACTIVAR / DESACTIVAR
    // ════════════════════════════════════════════════════════════

    async deactivate(id: string): Promise<{ message: string }> {
        const cuenta = await this.cuentaRepo.findOne({ where: { id, activo: true } });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);
        cuenta.activo = false;
        await this.cuentaRepo.save(cuenta);
        return { message: 'Usuario desactivado correctamente' };
    }

    async reactivate(id: string): Promise<{ message: string }> {
        const cuenta = await this.cuentaRepo.findOne({ where: { id } });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);
        if (cuenta.activo) return { message: 'La cuenta ya está activa' };
        cuenta.activo = true;
        await this.cuentaRepo.save(cuenta);
        return { message: 'Usuario reactivado correctamente' };
    }

    // ════════════════════════════════════════════════════════════
    // CONTRASEÑAS
    // ════════════════════════════════════════════════════════════

    // Reset por admin — vuelve al DNI y marca como no cambiada
    async resetPassword(id: string): Promise<{ message: string }> {
        const cuenta = await this.cuentaRepo.findOne({ where: { id, activo: true } });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);

        const newHash = await bcrypt.hash(cuenta.numero_documento, 10);
        await this.cuentaRepo
            .createQueryBuilder()
            .update()
            .set({ password_hash: newHash, password_changed: false })
            .where('id = :id', { id })
            .execute();

        return { message: 'Contraseña reseteada al DNI correctamente' };
    }

    // Cambio de contraseña por el usuario — marca como cambiada
    async updatePassword(id: string, newHash: string): Promise<void> {
        await this.cuentaRepo
            .createQueryBuilder()
            .update()
            .set({ password_hash: newHash, password_changed: true })
            .where('id = :id', { id })
            .execute();
    }

    // ════════════════════════════════════════════════════════════
    // VINCULAR PADRE ↔ ALUMNO
    // ════════════════════════════════════════════════════════════

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

    // ════════════════════════════════════════════════════════════
    // STATS DASHBOARD ADMIN
    // ════════════════════════════════════════════════════════════

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

    // ════════════════════════════════════════════════════════════
    // MÉTODOS PARA AUTH SERVICE
    // ════════════════════════════════════════════════════════════

    async findCuentaByCodigoAcceso(codigoAcceso: string) {
        return this.cuentaRepo
            .createQueryBuilder('c')
            .select([
                'c.id',
                'c.rol',
                'c.password_hash',
                'c.codigo_acceso',
                'c.password_changed',
                'c.activo',
            ])
            .where('c.codigo_acceso = :codigo AND c.activo = true', { codigo: codigoAcceso })
            .getOne();
    }

    // Mantener para compatibilidad con otros servicios que lo usen
    async findCuentaByDocumento(tipo: string, numero: string) {
        return this.cuentaRepo
            .createQueryBuilder('c')
            .select([
                'c.id',
                'c.rol',
                'c.password_hash',
                'c.tipo_documento',
                'c.numero_documento',
                'c.codigo_acceso',
                'c.password_changed',
                'c.activo',
            ])
            .where('c.tipo_documento = :tipo AND c.numero_documento = :numero AND c.activo = true', {
                tipo,
                numero: numero.trim(),
            })
            .getOne();
    }

    async findCuentaById(id: string): Promise<Cuenta | null> {
        return this.cuentaRepo.findOne({ where: { id } });
    }

    async updateUltimoAcceso(id: string): Promise<void> {
        await this.cuentaRepo
            .createQueryBuilder()
            .update()
            .set({ ultimo_acceso: new Date() })
            .where('id = :id', { id })
            .execute();
    }
    // src/modules/users/users.service.ts


    // src/modules/users/users.service.ts

    async findPsicologas() {
        return this.dataSource.query(`
            SELECT
                p.id,
                c.numero_documento                                  AS dni,
                c.codigo_acceso,
                p.nombre                                            AS nombres,
                p.apellido_paterno,
                p.apellido_materno,
                TRIM(CONCAT(p.apellido_paterno, ' ',
                            COALESCE(p.apellido_materno, '')))      AS apellidos,
                p.especialidad,
                p.colegiatura,
                p.email                                             AS correo,
                p.telefono,
                p.foto_storage_key,
                c.activo,
                c.password_changed
            FROM psicologas p
            INNER JOIN cuentas c ON c.id = p.id
            ORDER BY p.apellido_paterno ASC, p.nombre ASC
        `);
    }

    // ════════════════════════════════════════════════════════════
    // PERFIL PROPIO (cualquier usuario logueado)
    // ════════════════════════════════════════════════════════════

    async getProfileById(id: string, rol: string) {
        switch (rol) {
            case 'alumno': return this.alumnoRepo.findOne({ where: { id } });
            case 'docente': return this.docenteRepo.findOne({ where: { id } });
            case 'padre': return this.padreRepo.findOne({ where: { id } });
            case 'admin': return this.adminRepo.findOne({ where: { id } });
            default: return this.cuentaRepo.findOne({ where: { id } });
        }
    }

    async updateProfile(id: string, rol: string, dto: any) {
        const allowed = ['nombre', 'apellido_paterno', 'apellido_materno', 'telefono'];
        const data: any = {};
        allowed.forEach(k => { if (dto[k] !== undefined) data[k] = dto[k]; });

        switch (rol) {
            case 'alumno': await this.alumnoRepo.update(id, data); break;
            case 'docente': await this.docenteRepo.update(id, data); break;
            case 'padre': await this.padreRepo.update(id, data); break;
            case 'admin': await this.adminRepo.update(id, data); break;
        }
        return { message: 'Perfil actualizado correctamente' };
    }

    async updateEmail(id: string, rol: string, dto: { email: string; password: string }) {
        const cuenta = await this.cuentaRepo.findOne({ where: { id } });
        if (!cuenta) throw new NotFoundException('Cuenta no encontrada');

        const bcrypt = await import('bcrypt');
        const ok = await bcrypt.compare(dto.password, cuenta.password_hash);
        if (!ok) throw new BadRequestException('Contraseña incorrecta');

        switch (rol) {
            case 'alumno': await this.alumnoRepo.update(id, { email: dto.email }); break;
            case 'docente': await this.docenteRepo.update(id, { email: dto.email }); break;
            case 'padre': await this.padreRepo.update(id, { email: dto.email }); break;
            case 'admin': await this.adminRepo.update(id, { email: dto.email }); break;
        }
        return { message: 'Correo actualizado correctamente' };
    }

    async updatePasswordProfile(id: string, dto: { current_password: string; new_password: string }) {
        const cuenta = await this.cuentaRepo.findOne({ where: { id } });
        if (!cuenta) throw new NotFoundException('Cuenta no encontrada');

        const bcrypt = await import('bcrypt');
        const ok = await bcrypt.compare(dto.current_password, cuenta.password_hash);
        if (!ok) throw new BadRequestException('La contraseña actual es incorrecta');

        const isSame = await bcrypt.compare(dto.new_password, cuenta.password_hash);
        if (isSame) throw new BadRequestException('La nueva contraseña no puede ser igual a la actual');

        const newHash = await bcrypt.hash(dto.new_password, 10);
        await this.cuentaRepo.update(id, { password_hash: newHash, password_changed: true });
        return { message: 'Contraseña actualizada correctamente' };
    }

    async updateFoto(id: string, rol: string, file: Express.Multer.File) {
        const key = await this.storageService.uploadFile(
            { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
            'fotos-perfil',
        );

        const fotoUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN}${key}`;

        switch (rol) {
            case 'alumno': await this.alumnoRepo.update(id, { foto_storage_key: key }); break;
            case 'docente': await this.docenteRepo.update(id, { foto_storage_key: key }); break;
            case 'padre': await this.padreRepo.update(id, { foto_storage_key: key } as any); break;
            case 'admin': await this.adminRepo.update(id, { foto_storage_key: key } as any); break;
        }

        return { message: 'Foto actualizada', foto_url: fotoUrl };
    }
}