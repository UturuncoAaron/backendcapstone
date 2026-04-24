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

    // ── Helpers privados ────────────────────────────────────────

    private async checkDocumentoUnico(tipo: string, numero: string) {
        const exists = await this.cuentaRepo.findOne({
            where: { tipo_documento: tipo as any, numero_documento: numero.trim() },
        });
        if (exists) {
            throw new ConflictException(
                `Ya existe un usuario con ${tipo} ${numero}`,
            );
        }
    }

    private async crearCuenta(
        tipo: string,
        numero: string,
        password: string,
        rol: string,
    ): Promise<Cuenta> {
        const password_hash = await bcrypt.hash(password, 12);
        const cuenta = this.cuentaRepo.create({
            tipo_documento: tipo as any,
            numero_documento: numero.trim(),
            password_hash,
            rol: rol as any,
        });
        return this.cuentaRepo.save(cuenta);
    }

    // ── Crear usuarios por rol ───────────────────────────────────

    async createAlumno(dto: CreateAlumnoDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);

        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash,
                rol: 'alumno',
            });
            await em.save(cuenta);

            const alumno = em.create(Alumno, {
                id: cuenta.id,
                codigo_estudiante: dto.codigo_estudiante,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : null,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            });
            return em.save(alumno);
        });
    }

    async createDocente(dto: CreateDocenteDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);

        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash,
                rol: 'docente',
            });
            await em.save(cuenta);

            const docente = em.create(Docente, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                especialidad: dto.especialidad ?? null,
                titulo_profesional: dto.titulo_profesional ?? null,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            });
            return em.save(docente);
        });
    }

    async createPadre(dto: CreatePadreDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);

        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash,
                rol: 'padre',
            });
            await em.save(cuenta);

            const padre = em.create(Padre, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                relacion: dto.relacion as any,
                email: dto.email ?? null,
                telefono: dto.telefono ?? null,
            });
            return em.save(padre);
        });
    }

    async createAdmin(dto: CreateAdminDto) {
        await this.checkDocumentoUnico(dto.tipo_documento, dto.numero_documento);

        return this.dataSource.transaction(async (em) => {
            const password_hash = await bcrypt.hash(dto.password, 12);
            const cuenta = em.create(Cuenta, {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
                password_hash,
                rol: 'admin',
            });
            await em.save(cuenta);

            const admin = em.create(Admin, {
                id: cuenta.id,
                nombre: dto.nombre,
                apellido_paterno: dto.apellido_paterno,
                apellido_materno: dto.apellido_materno ?? null,
                cargo: dto.cargo ?? null,
                email: dto.email ?? null,
            });
            return em.save(admin);
        });
    }

    // ── Listar por rol ───────────────────────────────────────────

    async findAlumnos() {
        return this.alumnoRepo.find({
            order: { apellido_paterno: 'ASC', nombre: 'ASC' },
        });
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

    // ── Buscar (para asignaciones, autocomplete) ─────────────────

    async searchAlumnos(query: string) {
        if (!query || query.length < 3) return { data: [] };

        const rows = await this.alumnoRepo.find({
            where: [
                { codigo_estudiante: ILike(`${query}%`) },
                { nombre: ILike(`%${query}%`) },
                { apellido_paterno: ILike(`%${query}%`) },
            ],
            take: 10,
            select: ['id', 'codigo_estudiante', 'nombre', 'apellido_paterno'],
        });

        return { data: rows };
    }

    async searchDocentes(query: string) {
        if (!query || query.length < 3) return { data: [] };

        const rows = await this.docenteRepo.find({
            where: [
                { nombre: ILike(`%${query}%`) },
                { apellido_paterno: ILike(`%${query}%`) },
            ],
            take: 10,
            select: ['id', 'nombre', 'apellido_paterno', 'especialidad'],
        });

        return { data: rows };
    }

    // ── Obtener uno ──────────────────────────────────────────────

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

    // ── Desactivar cuenta ────────────────────────────────────────

    async deactivate(id: string): Promise<{ message: string }> {
        const cuenta = await this.cuentaRepo.findOne({ where: { id, activo: true } });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);

        cuenta.activo = false;
        await this.cuentaRepo.save(cuenta);
        return { message: 'Usuario desactivado correctamente' };
    }

    // ── Reset de contraseña ──────────────────────────────────────

    async resetPassword(id: string, newPassword: string): Promise<{ message: string }> {
        if (newPassword.length < 6) {
            throw new BadRequestException('La contraseña debe tener mínimo 6 caracteres');
        }

        const cuenta = await this.cuentaRepo.findOne({ where: { id, activo: true } });
        if (!cuenta) throw new NotFoundException(`Cuenta ${id} no encontrada`);

        cuenta.password_hash = await bcrypt.hash(newPassword, 12);
        await this.cuentaRepo.save(cuenta);
        return { message: 'Contraseña actualizada correctamente' };
    }

    // ── Vincular padre ↔ alumno ──────────────────────────────────

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

    // ── Stats para dashboard admin ───────────────────────────────

    async getStats() {
        const [alumnos, docentes, padres, cursos] = await Promise.all([
            this.alumnoRepo.count(),
            this.docenteRepo.count(),
            this.padreRepo.count(),
            this.dataSource.query(`SELECT COUNT(*) FROM cursos WHERE activo = true`),
        ]);

        return {
            alumnos,
            docentes,
            padres,
            cursos: parseInt(cursos[0].count),
        };
    }

    // ── Usado por AuthService para login ─────────────────────────

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