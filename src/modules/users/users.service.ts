import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import sharp from 'sharp';

import { Cuenta } from './entities/cuenta.entity.js';
import { Alumno } from './entities/alumno.entity.js';
import { Docente } from './entities/docente.entity.js';
import { Padre } from './entities/padre.entity.js';
import { Admin } from './entities/admin.entity.js';
import { Psicologa } from './entities/psicologa.entity.js';
import { Auxiliar } from './entities/auxiliar.entity.js';
import { StorageService } from '../storage/storage.service.js';

import {
    CreateAlumnoDto,
    CreateDocenteDto,
    CreatePadreDto,
    CreateAdminDto,
    CreatePsicologaDto,
    CreateAuxiliarDto,
    LinkPadreAlumnoDto,
} from './dto/users.dto.js';
import { UpdateFullDto } from './dto/profile.dto.js';

const ROLE_PREFIX: Record<string, string> = {
    alumno: 'EST', docente: 'DOC', padre: 'PAD',
    admin: 'ADM', psicologa: 'PSI',
    auxiliar: 'AUX',
};

const PROFILE_FIELDS = [
    'nombre', 'apellido_paterno', 'apellido_materno',
    'telefono', 'email',
    'especialidad', 'titulo_profesional', 'colegiatura',
    'cargo', 'relacion',
] as const;

const SENSITIVE_FIELDS = ['foto_storage_key', 'password_changed', 'password_hash'];

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(Cuenta) private readonly cuentaRepo: Repository<Cuenta>,
        @InjectRepository(Alumno) private readonly alumnoRepo: Repository<Alumno>,
        @InjectRepository(Docente) private readonly docenteRepo: Repository<Docente>,
        @InjectRepository(Padre) private readonly padreRepo: Repository<Padre>,
        @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
        @InjectRepository(Psicologa) private readonly psicologaRepo: Repository<Psicologa>,
        @InjectRepository(Auxiliar) private readonly auxiliarRepo: Repository<Auxiliar>,
        private readonly dataSource: DataSource,
        private readonly storageService: StorageService,
    ) { }

    // ══════════════════════════════════════════════════════════════════════════
    // HELPERS PRIVADOS
    // ══════════════════════════════════════════════════════════════════════════

    async checkDocumentoUnico(tipo: string, numero: string): Promise<void> {
        const exists = await this.cuentaRepo.findOne({
            where: { tipo_documento: tipo as any, numero_documento: numero.trim() },
            select: ['id'],
        });
        if (exists) throw new ConflictException(`Ya existe un usuario con ${tipo} ${numero}`);
    }

    private buildCodigoAcceso(rol: string, dni: string): string {
        return `${ROLE_PREFIX[rol] ?? 'USR'}-${dni.trim()}`;
    }

    private async createCuenta(
        em: EntityManager,
        rol: string,
        tipo_documento: string,
        numero_documento: string,
    ): Promise<Cuenta> {
        const dni = numero_documento.trim();
        const password_hash = await bcrypt.hash(dni, 10);
        const codigo_acceso = this.buildCodigoAcceso(rol, dni);
        return em.save(em.create(Cuenta, {
            tipo_documento: tipo_documento as any,
            numero_documento: dni,
            password_hash,
            codigo_acceso,
            password_changed: false,
            rol: rol as any,
        }));
    }

    private repoByRol(rol: string): Repository<any> | null {
        const map: Record<string, Repository<any>> = {
            alumno: this.alumnoRepo,
            docente: this.docenteRepo,
            padre: this.padreRepo,
            admin: this.adminRepo,
            psicologa: this.psicologaRepo,
            auxiliar: this.auxiliarRepo,
        };
        return map[rol] ?? null;
    }

    private sanitize(row: Record<string, any>, forList = false): void {
        row.foto_url = row.foto_storage_key
            ? this.storageService.getPublicUrl(row.foto_storage_key)
            : null;
        for (const field of SENSITIVE_FIELDS) {
            delete row[field];
        }
        if (forList) {
            delete row.codigo_acceso;
            delete row.created_at;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CREAR USUARIOS
    // ══════════════════════════════════════════════════════════════════════════

    async createAlumno(dto: CreateAlumnoDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const cuenta = await this.createCuenta(em, 'alumno', dto.tipo_documento, dto.numero_documento);
            return em.save(em.create(Alumno, {
                id: cuenta.id,
                codigo_estudiante: dto.codigo_estudiante ?? `EST-${cuenta.numero_documento}`,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                fecha_nacimiento: new Date(dto.fecha_nacimiento),
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            }));
        });
    }

    async createDocente(dto: CreateDocenteDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const cuenta = await this.createCuenta(em, 'docente', dto.tipo_documento, dto.numero_documento);
            return em.save(em.create(Docente, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                especialidad: dto.especialidad ?? null,
                titulo_profesional: dto.titulo_profesional ?? null,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
                fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : null,
                tipo_contrato: dto.tipo_contrato ?? 'contratado',
                estado_contrato: dto.estado_contrato ?? 'activo',
                fecha_inicio_contrato: dto.fecha_inicio_contrato ? new Date(dto.fecha_inicio_contrato) : null,
                fecha_fin_contrato: dto.fecha_fin_contrato ? new Date(dto.fecha_fin_contrato) : null,
            }));
        });
    }

    async createPadre(dto: CreatePadreDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const cuenta = await this.createCuenta(em, 'padre', dto.tipo_documento, dto.numero_documento);
            return em.save(em.create(Padre, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                relacion: dto.relacion as any,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
                fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : null,
            }));
        });
    }

    async createAdmin(dto: CreateAdminDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const cuenta = await this.createCuenta(em, 'admin', dto.tipo_documento, dto.numero_documento);
            return em.save(em.create(Admin, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                cargo: dto.cargo ?? null,
                email: dto.email ?? null,
                fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : null,
            }));
        });
    }

    async createPsicologa(dto: CreatePsicologaDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const cuenta = await this.createCuenta(em, 'psicologa', dto.tipo_documento, dto.numero_documento);
            return em.save(em.create(Psicologa, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                especialidad: dto.especialidad ?? null,
                colegiatura: dto.colegiatura ?? null,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
                fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : null,
            }));
        });
    }

    async createAuxiliar(dto: CreateAuxiliarDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);
        return this.dataSource.transaction(async (em) => {
            const cuenta = await this.createCuenta(em, 'auxiliar', dto.tipo_documento, dto.numero_documento);
            return em.save(em.create(Auxiliar, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                cargo: dto.cargo ?? 'Auxiliar de Educación',
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
                fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : null,
                tipo_contrato: dto.tipo_contrato ?? 'contratado',
                estado_contrato: dto.estado_contrato ?? 'activo',
                fecha_inicio_contrato: dto.fecha_inicio_contrato ? new Date(dto.fecha_inicio_contrato) : null,
                fecha_fin_contrato: dto.fecha_fin_contrato ? new Date(dto.fecha_fin_contrato) : null,
            }));
        });
    }
    async findAdmins(filters?: { q?: string; page?: number; limit?: number }) {
        const page = filters?.page ?? 1;
        const limit = filters?.limit ?? 20;
        const offset = (page - 1) * limit;

        const qb = this.adminRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id               AS id',
                'a.nombre           AS nombre',
                'a.apellido_paterno AS apellido_paterno',
                'a.apellido_materno AS apellido_materno',
                'a.cargo            AS cargo',
                'a.email            AS email',
                'a.foto_storage_key AS foto_storage_key',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.activo           AS activo',
            ])
            .orderBy('a.apellido_paterno', 'ASC')
            .addOrderBy('a.nombre', 'ASC');

        if (filters?.q && filters.q.trim().length >= 2) {
            const q = `%${filters.q.trim()}%`;
            qb.andWhere(
                `(a.nombre ILIKE :q OR a.apellido_paterno ILIKE :q
              OR a.apellido_materno ILIKE :q OR c.numero_documento ILIKE :q
              OR a.cargo ILIKE :q)`,
                { q },
            );
        }

        const total = await qb.getCount();
        const rows = await qb.limit(limit).offset(offset).getRawMany();
        rows.forEach(r => this.sanitize(r, true));
        return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findAlumnos(filters: {
        q?: string;
        gradoId?: string;
        seccionId?: string;
        page?: number;
        limit?: number;
        activo?: boolean;
    }) {
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 20;
        const offset = (page - 1) * limit;

        const qb = this.alumnoRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
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
                'a.foto_storage_key  AS foto_storage_key',
                'c.numero_documento  AS numero_documento',
                'c.tipo_documento    AS tipo_documento',
                'c.activo            AS activo',
                'g.nombre            AS grado',
                'g.id                AS grado_id',
                's.nombre            AS seccion',
                's.id                AS seccion_id',
            ]);

        if (filters.seccionId) {
            qb.andWhere('s.id = :seccionId', { seccionId: filters.seccionId });
        } else if (filters.gradoId) {
            qb.andWhere('g.id = :gradoId', { gradoId: Number(filters.gradoId) });
        }

        if (filters.activo !== undefined) {
            qb.andWhere('c.activo = :activo', { activo: filters.activo });
        }

        if (filters.q && filters.q.trim().length >= 2) {
            const q = `%${filters.q.trim()}%`;
            qb.andWhere(
                `(a.nombre           ILIKE :q
              OR a.apellido_paterno ILIKE :q
              OR a.apellido_materno ILIKE :q
              OR c.numero_documento ILIKE :q
              OR a.codigo_estudiante ILIKE :q)`,
                { q },
            );
        }

        const total = await qb.getCount();
        const rows = await qb
            .orderBy('a.apellido_paterno', 'ASC')
            .addOrderBy('a.nombre', 'ASC')
            .limit(limit)
            .offset(offset)
            .getRawMany();

        rows.forEach(r => this.sanitize(r, true));

        return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findDocentes(filters?: {
        q?: string;
        includeTutoria?: boolean;
        page?: number;
        limit?: number;
    }) {
        const page = filters?.page ?? 1;
        const limit = filters?.limit ?? 20;
        const offset = (page - 1) * limit;

        const qb = this.docenteRepo
            .createQueryBuilder('d')
            .innerJoin('cuentas', 'c', 'c.id = d.id')
            .select([
                'd.id               AS id',
                'd.nombre           AS nombre',
                'd.apellido_paterno AS apellido_paterno',
                'd.apellido_materno AS apellido_materno',
                'd.especialidad     AS especialidad',
                'd.email            AS email',
                'd.telefono         AS telefono',
                'd.tipo_contrato    AS tipo_contrato',
                'd.estado_contrato  AS estado_contrato',
                'd.foto_storage_key AS foto_storage_key',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.activo           AS activo',
            ])
            .orderBy('d.apellido_paterno', 'ASC')
            .addOrderBy('d.nombre', 'ASC');

        if (filters?.includeTutoria) {
            qb.leftJoin('secciones', 's', 's.tutor_id = d.id AND s.activo = true')
                .leftJoin('grados', 'g', 'g.id = s.grado_id')
                .addSelect(`
              CASE WHEN s.id IS NULL THEN NULL
                   ELSE jsonb_build_object(
                       'seccion_id',    s.id,
                       'seccion_label', g.nombre || ' – Sección ' || s.nombre
                   )
              END AS tutoria_actual
          `);
        }

        if (filters?.q && filters.q.trim().length >= 2) {
            const q = `%${filters.q.trim()}%`;
            qb.andWhere(
                `(d.nombre ILIKE :q OR d.apellido_paterno ILIKE :q
              OR d.apellido_materno ILIKE :q OR c.numero_documento ILIKE :q
              OR d.especialidad ILIKE :q)`,
                { q },
            );
        }

        const total = await qb.getCount();
        const rows = await qb.limit(limit).offset(offset).getRawMany();
        rows.forEach(r => this.sanitize(r, true));
        return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findPadres(filters?: { q?: string; page?: number; limit?: number }) {
        const page = filters?.page ?? 1;
        const limit = filters?.limit ?? 20;
        const offset = (page - 1) * limit;

        const qb = this.padreRepo
            .createQueryBuilder('p')
            .innerJoin('cuentas', 'c', 'c.id = p.id')
            .select([
                'p.id               AS id',
                'p.nombre           AS nombre',
                'p.apellido_paterno AS apellido_paterno',
                'p.apellido_materno AS apellido_materno',
                'p.relacion         AS relacion',
                'p.email            AS email',
                'p.telefono         AS telefono',
                'p.foto_storage_key AS foto_storage_key',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.activo           AS activo',
            ])
            .orderBy('p.apellido_paterno', 'ASC')
            .addOrderBy('p.nombre', 'ASC');

        if (filters?.q && filters.q.trim().length >= 2) {
            const q = `%${filters.q.trim()}%`;
            qb.andWhere(
                `(p.nombre ILIKE :q OR p.apellido_paterno ILIKE :q
              OR p.apellido_materno ILIKE :q OR c.numero_documento ILIKE :q)`,
                { q },
            );
        }

        const total = await qb.getCount();
        const rows = await qb.limit(limit).offset(offset).getRawMany();
        rows.forEach(r => this.sanitize(r, true));

        return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findPsicologas(filters?: { q?: string; page?: number; limit?: number }) {
        const page = filters?.page ?? 1;
        const limit = filters?.limit ?? 20;
        const offset = (page - 1) * limit;

        const qb = this.psicologaRepo
            .createQueryBuilder('p')
            .innerJoin('cuentas', 'c', 'c.id = p.id')
            .select([
                'p.id               AS id',
                'p.nombre           AS nombre',
                'p.apellido_paterno AS apellido_paterno',
                'p.apellido_materno AS apellido_materno',
                'p.especialidad     AS especialidad',
                'p.colegiatura      AS colegiatura',
                'p.email            AS email',
                'p.telefono         AS telefono',
                'p.foto_storage_key AS foto_storage_key',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.activo           AS activo',
            ])
            .orderBy('p.apellido_paterno', 'ASC')
            .addOrderBy('p.nombre', 'ASC');

        if (filters?.q && filters.q.trim().length >= 2) {
            const q = `%${filters.q.trim()}%`;
            qb.andWhere(
                `(p.nombre ILIKE :q OR p.apellido_paterno ILIKE :q
              OR p.apellido_materno ILIKE :q OR c.numero_documento ILIKE :q
              OR p.especialidad ILIKE :q)`,
                { q },
            );
        }

        const total = await qb.getCount();
        const rows = await qb.limit(limit).offset(offset).getRawMany();
        rows.forEach(r => this.sanitize(r, true));
        return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
    async findAuxiliares(filters?: { q?: string; page?: number; limit?: number }) {
        const page = filters?.page ?? 1;
        const limit = filters?.limit ?? 20;
        const offset = (page - 1) * limit;

        const qb = this.auxiliarRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id                    AS id',
                'a.nombre                AS nombre',
                'a.apellido_paterno      AS apellido_paterno',
                'a.apellido_materno      AS apellido_materno',
                'a.cargo                 AS cargo',
                'a.email                 AS email',
                'a.telefono              AS telefono',
                'a.foto_storage_key      AS foto_storage_key',
                'a.tipo_contrato         AS tipo_contrato',
                'a.estado_contrato       AS estado_contrato',
                'a.fecha_inicio_contrato AS fecha_inicio_contrato',
                'a.fecha_fin_contrato    AS fecha_fin_contrato',
                'c.numero_documento      AS numero_documento',
                'c.tipo_documento        AS tipo_documento',
                'c.activo                AS activo',
            ])
            .orderBy('a.apellido_paterno', 'ASC')
            .addOrderBy('a.nombre', 'ASC');

        if (filters?.q && filters.q.trim().length >= 2) {
            const q = `%${filters.q.trim()}%`;
            qb.andWhere(
                `(a.nombre ILIKE :q OR a.apellido_paterno ILIKE :q
                  OR a.apellido_materno ILIKE :q OR c.numero_documento ILIKE :q)`,
                { q },
            );
        }

        const total = await qb.getCount();
        const rows = await qb.limit(limit).offset(offset).getRawMany();
        rows.forEach(r => this.sanitize(r, true));
        return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BÚSQUEDAS (autocomplete)
    // ══════════════════════════════════════════════════════════════════════════

    async searchAlumnos(query: string) {
        if (!query || query.trim().length < 2) return [];
        return this.alumnoRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
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
                `a.nombre ILIKE :q OR a.apellido_paterno ILIKE :q
                 OR c.numero_documento ILIKE :q OR a.codigo_estudiante ILIKE :q
                 OR c.codigo_acceso ILIKE :q`,
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();
    }

    async searchDocentes(query: string) {
        if (!query || query.trim().length < 2) return [];
        return this.docenteRepo
            .createQueryBuilder('d')
            .innerJoin('cuentas', 'c', 'c.id = d.id')
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
                `d.nombre ILIKE :q OR d.apellido_paterno ILIKE :q
                 OR c.numero_documento ILIKE :q OR c.codigo_acceso ILIKE :q`,
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();
    }

    async searchPadres(query: string) {
        if (!query || query.trim().length < 2) return [];
        return this.padreRepo
            .createQueryBuilder('p')
            .innerJoin('cuentas', 'c', 'c.id = p.id')
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
                `p.nombre ILIKE :q OR p.apellido_paterno ILIKE :q
                 OR c.numero_documento ILIKE :q OR c.codigo_acceso ILIKE :q`,
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();
    }
    async searchAuxiliares(query: string) {
        if (!query || query.trim().length < 2) return [];
        return this.auxiliarRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id               AS id',
                'a.nombre           AS nombre',
                'a.apellido_paterno AS apellido_paterno',
                'a.apellido_materno AS apellido_materno',
                'c.numero_documento AS numero_documento',
                'c.codigo_acceso    AS codigo_acceso',
            ])
            .where(
                `a.nombre ILIKE :q OR a.apellido_paterno ILIKE :q
                 OR c.numero_documento ILIKE :q OR c.codigo_acceso ILIKE :q`,
                { q: `%${query.trim()}%` },
            )
            .limit(10)
            .getRawMany();
    }
    async findAlumnoById(id: string) {
        const row = await this.alumnoRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id                AS id',
                'a.codigo_estudiante AS codigo_estudiante',
                'a.nombre            AS nombre',
                'a.apellido_paterno  AS apellido_paterno',
                'a.apellido_materno  AS apellido_materno',
                'a.fecha_nacimiento  AS fecha_nacimiento',
                'a.email             AS email',
                'a.telefono          AS telefono',
                'a.foto_storage_key  AS foto_storage_key',
                'c.numero_documento  AS numero_documento',
                'c.tipo_documento    AS tipo_documento',
                'c.codigo_acceso     AS codigo_acceso',
                'c.activo            AS activo',
            ])
            .where('a.id = :id', { id })
            .getRawOne();
        if (!row) throw new NotFoundException(`Alumno ${id} no encontrado`);
        this.sanitize(row);
        return row;
    }

    async findDocenteById(id: string) {
        const row = await this.docenteRepo
            .createQueryBuilder('d')
            .innerJoin('cuentas', 'c', 'c.id = d.id')
            .select([
                'd.id                    AS id',
                'd.nombre                AS nombre',
                'd.apellido_paterno      AS apellido_paterno',
                'd.apellido_materno      AS apellido_materno',
                'd.especialidad          AS especialidad',
                'd.titulo_profesional    AS titulo_profesional',
                'd.email                 AS email',
                'd.telefono              AS telefono',
                'd.foto_storage_key      AS foto_storage_key',
                'd.tipo_contrato         AS tipo_contrato',
                'd.estado_contrato       AS estado_contrato',
                'd.fecha_inicio_contrato AS fecha_inicio_contrato',
                'd.fecha_fin_contrato    AS fecha_fin_contrato',
                'c.numero_documento      AS numero_documento',
                'c.tipo_documento        AS tipo_documento',
                'c.codigo_acceso         AS codigo_acceso',
                'c.activo                AS activo',
            ])
            .where('d.id = :id', { id })
            .getRawOne();
        if (!row) throw new NotFoundException(`Docente ${id} no encontrado`);
        this.sanitize(row);
        return row;
    }

    async findPadreById(id: string) {
        const row = await this.padreRepo
            .createQueryBuilder('p')
            .innerJoin('cuentas', 'c', 'c.id = p.id')
            .select([
                'p.id               AS id',
                'p.nombre           AS nombre',
                'p.apellido_paterno AS apellido_paterno',
                'p.apellido_materno AS apellido_materno',
                'p.relacion         AS relacion',
                'p.email            AS email',
                'p.telefono         AS telefono',
                'p.foto_storage_key AS foto_storage_key',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.codigo_acceso    AS codigo_acceso',
                'c.activo           AS activo',
            ])
            .where('p.id = :id', { id })
            .getRawOne();
        if (!row) throw new NotFoundException(`Padre ${id} no encontrado`);
        this.sanitize(row);
        return row;
    }

    async findAdminById(id: string) {
        const row = await this.adminRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id               AS id',
                'a.nombre           AS nombre',
                'a.apellido_paterno AS apellido_paterno',
                'a.apellido_materno AS apellido_materno',
                'a.cargo            AS cargo',
                'a.email            AS email',
                'a.telefono         AS telefono',
                'a.foto_storage_key AS foto_storage_key',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.codigo_acceso    AS codigo_acceso',
                'c.activo           AS activo',
            ])
            .where('a.id = :id', { id })
            .getRawOne();
        if (!row) throw new NotFoundException(`Admin ${id} no encontrado`);
        this.sanitize(row);
        return row;
    }

    async findPsicologaById(id: string) {
        const row = await this.psicologaRepo
            .createQueryBuilder('p')
            .innerJoin('cuentas', 'c', 'c.id = p.id')
            .select([
                'p.id               AS id',
                'p.nombre           AS nombre',
                'p.apellido_paterno AS apellido_paterno',
                'p.apellido_materno AS apellido_materno',
                'p.especialidad     AS especialidad',
                'p.colegiatura      AS colegiatura',
                'p.email            AS email',
                'p.telefono         AS telefono',
                'p.foto_storage_key AS foto_storage_key',
                'c.numero_documento AS numero_documento',
                'c.tipo_documento   AS tipo_documento',
                'c.codigo_acceso    AS codigo_acceso',
                'c.activo           AS activo',
            ])
            .where('p.id = :id', { id })
            .getRawOne();
        if (!row) throw new NotFoundException(`Psicóloga ${id} no encontrada`);
        this.sanitize(row);
        return row;
    }

    // 🆕 ─────────────────────────────────────────────────────────────────────
    async findAuxiliarById(id: string) {
        const row = await this.auxiliarRepo
            .createQueryBuilder('a')
            .innerJoin('cuentas', 'c', 'c.id = a.id')
            .select([
                'a.id                    AS id',
                'a.nombre                AS nombre',
                'a.apellido_paterno      AS apellido_paterno',
                'a.apellido_materno      AS apellido_materno',
                'a.cargo                 AS cargo',
                'a.email                 AS email',
                'a.telefono              AS telefono',
                'a.foto_storage_key      AS foto_storage_key',
                'a.tipo_contrato         AS tipo_contrato',
                'a.estado_contrato       AS estado_contrato',
                'a.fecha_inicio_contrato AS fecha_inicio_contrato',
                'a.fecha_fin_contrato    AS fecha_fin_contrato',
                'c.numero_documento      AS numero_documento',
                'c.tipo_documento        AS tipo_documento',
                'c.codigo_acceso         AS codigo_acceso',
                'c.activo                AS activo',
            ])
            .where('a.id = :id', { id })
            .getRawOne();
        if (!row) throw new NotFoundException(`Auxiliar ${id} no encontrado`);
        this.sanitize(row);
        return row;
    }
    async deactivate(id: string): Promise<{ message: string }> {
        const result = await this.cuentaRepo
            .createQueryBuilder()
            .update()
            .set({ activo: false })
            .where('id = :id AND activo = true', { id })
            .execute();
        if (!result.affected) throw new NotFoundException(`Cuenta ${id} no encontrada o ya inactiva`);
        return { message: 'Usuario desactivado correctamente' };
    }

    async reactivate(id: string): Promise<{ message: string }> {
        const result = await this.cuentaRepo
            .createQueryBuilder()
            .update()
            .set({ activo: true })
            .where('id = :id AND activo = false', { id })
            .execute();
        if (!result.affected) {
            const exists = await this.cuentaRepo.findOne({ where: { id }, select: ['id'] });
            if (!exists) throw new NotFoundException(`Cuenta ${id} no encontrada`);
            return { message: 'La cuenta ya estaba activa' };
        }
        return { message: 'Usuario reactivado correctamente' };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RESET PASSWORD
    // ══════════════════════════════════════════════════════════════════════════

    async resetPassword(id: string): Promise<{ message: string }> {
        const cuenta = await this.cuentaRepo.findOne({
            where: { id, activo: true },
            select: ['id', 'numero_documento'],
        });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);
        const newHash = await bcrypt.hash(cuenta.numero_documento, 10);
        await this.cuentaRepo.update(id, { password_hash: newHash, password_changed: false });
        return { message: 'Contraseña reseteada al DNI correctamente' };
    }

    async updatePassword(id: string, newHash: string) {
        await this.cuentaRepo.update({ id }, {
            password_hash: newHash,
            password_changed: true
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VINCULAR PADRE ↔ ALUMNO
    // ══════════════════════════════════════════════════════════════════════════

    async linkPadreAlumno(dto: LinkPadreAlumnoDto) {
        const [padre, alumno] = await Promise.all([
            this.padreRepo
                .createQueryBuilder('p')
                .innerJoin('cuentas', 'c', 'c.id = p.id AND c.activo = true')
                .select(['p.id', 'p.nombre', 'p.apellido_paterno'])
                .where('c.numero_documento = :doc', { doc: dto.padre_doc })
                .getOne(),
            this.alumnoRepo
                .createQueryBuilder('a')
                .innerJoin('cuentas', 'c', 'c.id = a.id AND c.activo = true')
                .select(['a.id', 'a.nombre', 'a.apellido_paterno'])
                .where('c.numero_documento = :doc', { doc: dto.alumno_doc })
                .getOne(),
        ]);

        if (!padre) throw new NotFoundException(`Padre con documento ${dto.padre_doc} no encontrado`);
        if (!alumno) throw new NotFoundException(`Alumno con documento ${dto.alumno_doc} no encontrado`);

        const [existing] = await this.dataSource.query(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2`,
            [padre.id, alumno.id],
        );
        if (existing) throw new ConflictException('Este vínculo ya existe');

        await this.dataSource.query(
            `INSERT INTO padre_alumno (padre_id, alumno_id) VALUES ($1, $2)`,
            [padre.id, alumno.id],
        );

        return {
            padre: `${padre.nombre} ${padre.apellido_paterno}`,
            alumno: `${alumno.nombre} ${alumno.apellido_paterno}`,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MÉTODOS PARA AUTH SERVICE
    // ══════════════════════════════════════════════════════════════════════════

    async findCuentaByCodigoAcceso(codigoAcceso: string) {
        return this.cuentaRepo
            .createQueryBuilder('c')
            .select(['c.id', 'c.rol', 'c.password_hash', 'c.codigo_acceso', 'c.password_changed', 'c.activo'])
            .where('c.codigo_acceso = :codigo AND c.activo = true', { codigo: codigoAcceso })
            .getOne();
    }

    async findCuentaByDocumento(tipo: string, numero: string) {
        return this.cuentaRepo
            .createQueryBuilder('c')
            .select([
                'c.id', 'c.rol', 'c.password_hash', 'c.tipo_documento',
                'c.numero_documento', 'c.codigo_acceso', 'c.password_changed', 'c.activo',
            ])
            .where('c.tipo_documento = :tipo AND c.numero_documento = :numero AND c.activo = true', {
                tipo, numero: numero.trim(),
            })
            .getOne();
    }

    async findCuentaById(id: string): Promise<Cuenta | null> {
        return this.cuentaRepo.findOne({
            where: { id },
            select: ['id', 'rol', 'activo', 'password_changed', 'password_hash'],
        });
    }

    async updateUltimoAcceso(id: string): Promise<void> {
        this.cuentaRepo.update(id, { ultimo_acceso: new Date() }).catch(() => { });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PERFIL COMPLETO
    // ══════════════════════════════════════════════════════════════════════════

    async getProfileById(id: string, rol: string) {
        let row: any;
        switch (rol) {
            case 'alumno': row = await this.findAlumnoById(id); break;
            case 'docente': row = await this.findDocenteById(id); break;
            case 'padre': row = await this.findPadreById(id); break;
            case 'admin': row = await this.findAdminById(id); break;
            case 'psicologa': row = await this.findPsicologaById(id); break;
            case 'auxiliar': row = await this.findAuxiliarById(id); break;   // 🆕
            default:
                return this.cuentaRepo.findOne({ where: { id }, select: ['id', 'rol', 'activo'] });
        }
        return row;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTUALIZAR PERFIL
    // ══════════════════════════════════════════════════════════════════════════

    async updateFull(
        id: string,
        rol: string,
        dto: UpdateFullDto,
        isSelf: boolean,
    ): Promise<{ message: string }> {
        return this.dataSource.transaction(async (em) => {

            const profileData: Record<string, any> = {};
            for (const k of PROFILE_FIELDS) {
                if (dto[k] !== undefined) profileData[k] = dto[k] || null;
            }
            if (Object.keys(profileData).length) {
                const repo = this.repoByRol(rol);
                if (repo) await em.getRepository(repo.target).update(id, profileData);
            }

            if (!isSelf && (dto.tipo_documento || dto.numero_documento)) {
                const cuentaUpd: Record<string, any> = {};
                if (dto.tipo_documento) cuentaUpd['tipo_documento'] = dto.tipo_documento;
                if (dto.numero_documento) {
                    const dni = dto.numero_documento.trim();
                    const conflict = await em.getRepository(Cuenta).findOne({
                        where: { numero_documento: dni }, select: ['id'],
                    });
                    if (conflict && conflict.id !== id) {
                        throw new ConflictException(`Ya existe un usuario con documento ${dni}`);
                    }
                    cuentaUpd['numero_documento'] = dni;
                    cuentaUpd['codigo_acceso'] = this.buildCodigoAcceso(rol, dni);
                }
                await em.getRepository(Cuenta).update(id, cuentaUpd);
            }

            if (dto.new_password) {
                if (dto.new_password.length < 8) {
                    throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
                }
                if (isSelf) {
                    if (!dto.current_password) {
                        throw new BadRequestException('Debes ingresar tu contraseña actual para cambiarla');
                    }
                    const cuenta = await em.getRepository(Cuenta).findOne({
                        where: { id }, select: ['id', 'password_hash'],
                    });
                    if (!cuenta) throw new NotFoundException('Cuenta no encontrada');
                    const ok = await bcrypt.compare(dto.current_password, cuenta.password_hash);
                    if (!ok) throw new BadRequestException('La contraseña actual es incorrecta');
                    const isSame = await bcrypt.compare(dto.new_password, cuenta.password_hash);
                    if (isSame) throw new BadRequestException('La nueva contraseña no puede ser igual a la actual');
                }
                const newHash = await bcrypt.hash(dto.new_password, 10);
                await em.getRepository(Cuenta).update(id, {
                    password_hash: newHash,
                    password_changed: isSelf,
                });
            }

            return { message: 'Perfil actualizado correctamente' };
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FOTO DE PERFIL
    // ══════════════════════════════════════════════════════════════════════════

    async updateFoto(id: string, rol: string, file: Express.Multer.File) {
        const oldKeyPromise = this.getFotoKey(id, rol);

        const compressed = await sharp(file.buffer)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        const newKey = await this.storageService.uploadFile(
            {
                buffer: compressed,
                originalname: file.originalname.replace(/\.[^.]+$/, '.webp'),
                mimetype: 'image/webp',
            },
            'fotos-perfil',
        );

        const repo = this.repoByRol(rol);
        if (repo) await repo.update(id, { foto_storage_key: newKey });

        const oldKey = await oldKeyPromise;
        if (oldKey && oldKey !== newKey) {
            this.storageService.deleteFile(oldKey).catch(() => { });
        }

        return {
            message: 'Foto actualizada correctamente',
            foto_url: this.storageService.getPublicUrl(newKey),
        };
    }

    private async getFotoKey(id: string, rol: string): Promise<string | null> {
        const repo = this.repoByRol(rol);
        if (!repo) return null;
        const r = await repo.findOne({ where: { id }, select: ['foto_storage_key'] });
        return r?.foto_storage_key ?? null;
    }

    async createBulk(rol: string, dtos: any[]): Promise<any[]> {
        const results: any[] = [];
        for (const dto of dtos) {
            try {
                let result: any;
                switch (rol) {
                    case 'alumno': result = await this.createAlumno(dto); break;
                    case 'docente': result = await this.createDocente(dto); break;
                    case 'padre': result = await this.createPadre(dto); break;
                    case 'admin': result = await this.createAdmin(dto); break;
                    case 'psicologa': result = await this.createPsicologa(dto); break;
                    case 'auxiliar': result = await this.createAuxiliar(dto); break;   // 🆕
                }
                results.push({
                    ok: true,
                    numero_documento: dto.numero_documento,
                    id: result?.id ?? null,
                });
            } catch (e: any) {
                results.push({
                    ok: false,
                    numero_documento: dto.numero_documento,
                    error: e.message ?? 'Error desconocido',
                });
            }
        }
        return results;
    }

    async findCuentaByNumeroDocumento(numero_documento: string) {
        return this.cuentaRepo.findOne({
            where: { numero_documento: numero_documento.trim() },
        });
    }
}