import {
    Injectable, Logger, NotFoundException, ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { PsychologistStudent } from './entities/psychologist-student.entity.js';
import { PsychologyRecord } from './entities/psychology-record.entity.js';
import { InformePsicologico } from './entities/informe-psicologico.entity.js';
import { PsychologyArchivo } from './entities/psychology-archivo.entity.js';
import { Psicologa } from '../users/entities/psicologa.entity.js';
import {
    CreateRecordDto, UpdateRecordDto, PageQueryDto,
    CreateInformeDto, UpdateInformeDto,
    CreateArchivoDto, ArchivoQueryDto,
} from './dto/psychology.dto.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';

const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;
const MAX_FIRMA_BYTES = 2 * 1024 * 1024;
const FIRMA_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

@Injectable()
export class PsychologyService {
    private readonly logger = new Logger(PsychologyService.name);

    constructor(
        @InjectRepository(PsychologistStudent)
        private readonly assignmentRepo: Repository<PsychologistStudent>,
        @InjectRepository(PsychologyRecord)
        private readonly recordRepo: Repository<PsychologyRecord>,
        @InjectRepository(InformePsicologico)
        private readonly informeRepo: Repository<InformePsicologico>,
        @InjectRepository(PsychologyArchivo)
        private readonly archivoRepo: Repository<PsychologyArchivo>,
        @InjectRepository(Psicologa)
        private readonly psicologaRepo: Repository<Psicologa>,
        private readonly dataSource: DataSource,
        private readonly storage: StorageService,
        private readonly usersService: UsersService,
    ) { }

    // ── Fichas ────────────────────────────────────────────────────

    async createRecord(psychologistId: string, dto: CreateRecordDto) {
        return this.dataSource.transaction(async (em) => {
            await this.upsertAssignment(em, psychologistId, dto.studentId);
            const record = em.create(PsychologyRecord, {
                ...dto,
                psychologistId,
                citaId: dto.citaId ?? null,
            });
            return em.save(record);
        });
    }

    async getRecordsByStudent(
        psychologistId: string,
        studentId: string,
        q: PageQueryDto,
    ) {
        const assigned = await this.isAssigned(psychologistId, studentId);
        if (!assigned) return this.emptyPage(q.limit ?? 25);

        const page = q.page ?? 1;
        const limit = q.limit ?? 25;
        const where: Record<string, any> = { studentId };

        // sinCita=true  → cita_id IS NULL  (registros sin sesión)
        // citaId=<uuid> → cita_id = uuid   (registros de esa sesión)
        if (q.sinCita === 'true') where['citaId'] = IsNull();
        else if (q.citaId !== undefined) where['citaId'] = q.citaId;

        const [items, total] = await this.recordRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async updateRecord(
        psychologistId: string,
        recordId: string,
        dto: UpdateRecordDto,
    ): Promise<PsychologyRecord> {
        const record = await this.recordRepo.findOne({ where: { id: recordId } });
        if (!record) throw new NotFoundException('Ficha no encontrada');
        if (record.psychologistId !== psychologistId) throw new ForbiddenException('Acceso denegado');
        Object.assign(record, dto);
        return this.recordRepo.save(record);
    }

    async deleteRecord(psychologistId: string, recordId: string): Promise<void> {
        const record = await this.recordRepo.findOne({ where: { id: recordId } });
        if (!record) throw new NotFoundException('Ficha no encontrada');
        if (record.psychologistId !== psychologistId) throw new ForbiddenException('Acceso denegado');
        await this.recordRepo.remove(record);
    }

    // ── Firma ─────────────────────────────────────────────────────

    async uploadFirma(psychologistId: string, file: Express.Multer.File) {
        if (!FIRMA_ALLOWED_MIMES.includes(file.mimetype))
            throw new BadRequestException('La firma debe ser PNG, JPG o WEBP');
        if (file.size > MAX_FIRMA_BYTES)
            throw new BadRequestException('La firma no puede superar 2 MB');

        const psicologa = await this.getPsicologaOrFail(psychologistId);
        if (psicologa.firma_storage_key)
            await this.storage.deleteFile(psicologa.firma_storage_key).catch(() => { });

        const key = await this.storage.uploadFile(file, 'firmas');
        psicologa.firma_storage_key = key;
        await this.psicologaRepo.save(psicologa);
        return { firmaUrl: this.storage.getPublicUrl(key) };
    }

    async deleteFirma(psychologistId: string): Promise<void> {
        const psicologa = await this.getPsicologaOrFail(psychologistId);
        if (!psicologa.firma_storage_key) return;
        await this.storage.deleteFile(psicologa.firma_storage_key).catch(() => { });
        psicologa.firma_storage_key = null;
        await this.psicologaRepo.save(psicologa);
    }

    getFirmaUrl(_: string, psicologa: Psicologa) {
        return {
            firmaUrl: psicologa.firma_storage_key
                ? this.storage.getPublicUrl(psicologa.firma_storage_key)
                : null,
        };
    }

    async getPsicologaOrFail(psychologistId: string): Promise<Psicologa> {
        const p = await this.psicologaRepo.findOne({ where: { id: psychologistId } });
        if (!p) throw new NotFoundException('Psicóloga no encontrada');
        return p;
    }

    // ── Archivos ──────────────────────────────────────────────────

    async uploadArchivo(
        psychologistId: string,
        studentId: string,
        file: Express.Multer.File,
        dto: CreateArchivoDto,
    ) {
        if (file.size > MAX_ARCHIVO_BYTES)
            throw new BadRequestException('El archivo no puede superar 5 MB');

        const key = await this.storage.uploadFile(file, `psychology/${dto.categoria}`);
        await this.dataSource.query(
            `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
             VALUES ($1, $2, TRUE, CURRENT_DATE)
             ON CONFLICT (psicologa_id, alumno_id)
             DO UPDATE SET activo = TRUE, hasta = NULL`,
            [psychologistId, studentId],
        );

        const archivo = this.archivoRepo.create({
            psychologistId, studentId,
            categoria: dto.categoria,
            nombre: dto.nombre?.trim() || file.originalname,
            descripcion: dto.descripcion?.trim() || null,
            storageKey: key,
            nombreOriginal: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            citaId: dto.citaId ?? null,
        });
        return this.archivoRepo.save(archivo);
    }

    async listArchivos(psychologistId: string, studentId: string, q: ArchivoQueryDto) {
        const assigned = await this.isAssigned(psychologistId, studentId);
        if (!assigned) return this.emptyPage(q.limit ?? 50);

        const page = q.page ?? 1;
        const limit = q.limit ?? 50;
        const where: Record<string, any> = { studentId };
        if (q.categoria) where['categoria'] = q.categoria;

        if (q.sinCita === 'true') where['citaId'] = IsNull();
        else if (q.citaId !== undefined) where['citaId'] = q.citaId;

        const [items, total] = await this.archivoRepo.findAndCount({
            where, order: { createdAt: 'DESC' },
            skip: (page - 1) * limit, take: limit,
        });
        return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
    }

    async getArchivoDownloadUrl(psychologistId: string, archivoId: string) {
        const archivo = await this.assertArchivoOwned(psychologistId, archivoId);
        const url = await this.storage.getDownloadUrl(
            archivo.storageKey,
            archivo.nombreOriginal ?? archivo.nombre,
        );
        return { url };
    }

    async deleteArchivo(psychologistId: string, archivoId: string): Promise<void> {
        const archivo = await this.assertArchivoOwned(psychologistId, archivoId);
        await this.storage.deleteFile(archivo.storageKey).catch(() => { });
        await this.archivoRepo.remove(archivo);
    }

    private async assertArchivoOwned(psychologistId: string, archivoId: string) {
        const archivo = await this.archivoRepo.findOne({ where: { id: archivoId } });
        if (!archivo) throw new NotFoundException('Archivo no encontrado');
        if (archivo.psychologistId !== psychologistId)
            throw new ForbiddenException('Este archivo pertenece a otra psicóloga');
        return archivo;
    }

    // ── Asignaciones ──────────────────────────────────────────────

    async getMyStudents(psychologistId: string, q: PageQueryDto) {
        const page = q.page ?? 1;
        const limit = q.limit ?? 50;
        const offset = (page - 1) * limit;

        const [{ count }] = await this.dataSource.query(
            `SELECT COUNT(*)::int AS count FROM psicologa_alumno
             WHERE psicologa_id = $1 AND activo = TRUE`,
            [psychologistId],
        );
        const rows = await this.dataSource.query(
            `SELECT a.id, a.codigo_estudiante, a.nombre,
                    a.apellido_paterno, a.apellido_materno,
                    TRIM(CONCAT(a.apellido_paterno,' ',COALESCE(a.apellido_materno,''))) AS apellidos,
                    pa.activo, pa.desde, pa.hasta
             FROM psicologa_alumno pa
             INNER JOIN alumnos a ON a.id = pa.alumno_id
             WHERE pa.psicologa_id = $1 AND pa.activo = TRUE
             ORDER BY a.apellido_paterno, a.nombre
             LIMIT $2 OFFSET $3`,
            [psychologistId, limit, offset],
        );
        return { data: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
    }

    async unassignStudent(psychologistId: string, studentId: string): Promise<void> {
        const assignment = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
        });
        if (!assignment) throw new NotFoundException('Asignación no encontrada');
        assignment.activo = false;
        assignment.hasta = new Date().toISOString().split('T')[0];
        await this.assignmentRepo.save(assignment);
    }

    // ── Directorio ────────────────────────────────────────────────

    async searchStudents(query: string) {
        // Directorio para citas: necesitamos TODOS los alumnos (matriculados
        // o no). El filtro `incluirMatriculados=true` evita que `searchAlumnos`
        // excluya a los alumnos con matrícula activa — eso lo hace por
        // defecto porque su uso original es el flujo de "matricular alumno".
        const rows = await this.usersService.searchAlumnos(query, undefined, true);
        return rows.map((r: any) => this.stripCredentials(r));
    }

    async listStudents(
        psychologistId: string | null,
        q: { search?: string; page?: number; limit?: number },
    ) {
        const result = await this.usersService.findAlumnos({
            q: q.search, page: q.page ?? 1, limit: q.limit ?? 50,
        });

        if (psychologistId) {
            const assignments = await this.assignmentRepo.find({
                where: { psychologistId, activo: true },
                select: ['studentId'],
            });
            const enSeguimientoSet = new Set(assignments.map((a) => a.studentId));
            result.data = result.data.map((r: any) => ({
                ...this.stripCredentials(r),
                enSeguimiento: enSeguimientoSet.has(r.id),
            }));
        } else {
            result.data = result.data.map((r: any) => this.stripCredentials(r));
        }
        return result;
    }

    async searchParents(query: string) {
        const rows = await this.usersService.searchPadres(query);
        return rows.map((r: any) => this.stripCredentials(r));
    }

    async getStudentDetail(studentId: string) {
        const row = await this.usersService.findAlumnoById(studentId);
        if (!row) throw new NotFoundException('Alumno no encontrado');
        return this.stripCredentials(row);
    }

    async getStudentParents(studentId: string) {
        return this.dataSource.query(
            `SELECT p.id, p.nombre, p.apellido_paterno, p.apellido_materno,
                    p.relacion, p.email, p.telefono
             FROM padre_alumno pa
             JOIN padres  p ON p.id = pa.padre_id
             JOIN cuentas c ON c.id = p.id AND c.activo = TRUE
             WHERE pa.alumno_id = $1
             ORDER BY p.apellido_paterno, p.nombre`,
            [studentId],
        );
    }

    async listActivePsicologas(q?: string) {
        const term = (q ?? '').trim();
        const params: any[] = [];
        let where = `c.activo = TRUE`;
        if (term) {
            params.push(`%${term.toLowerCase()}%`);
            where += ` AND (
                LOWER(ps.nombre) LIKE $1 OR
                LOWER(ps.apellido_paterno) LIKE $1 OR
                LOWER(ps.apellido_materno) LIKE $1
            )`;
        }
        const rows: any[] = await this.dataSource.query(
            `SELECT ps.id, ps.nombre, ps.apellido_paterno, ps.apellido_materno,
                    ps.especialidad, ps.email, ps.telefono,
                    ps.foto_storage_key, ps.firma_storage_key
             FROM psicologas ps
             JOIN cuentas c ON c.id = ps.id
             WHERE ${where}
             ORDER BY ps.apellido_paterno, ps.nombre`,
            params,
        );
        return rows.map((r) => ({
            ...r,
            fotoUrl: r.foto_storage_key ? this.storage.getPublicUrl(r.foto_storage_key) : null,
            firmaUrl: r.firma_storage_key ? this.storage.getPublicUrl(r.firma_storage_key) : null,
        }));
    }

    // ── Informes ──────────────────────────────────────────────────

    async createInforme(psychologistId: string, dto: CreateInformeDto) {
        return this.dataSource.transaction(async (em) => {
            await this.upsertAssignment(em, psychologistId, dto.studentId);
            const informe = em.create(InformePsicologico, {
                psychologistId,
                studentId: dto.studentId,
                tipo: dto.tipo,
                titulo: dto.titulo,
                motivo: dto.motivo,
                antecedentes: dto.antecedentes ?? null,
                observaciones: dto.observaciones,
                recomendaciones: dto.recomendaciones ?? null,
                derivadoA: dto.derivadoA ?? null,
                confidencial: dto.confidencial ?? true,
                citaId: dto.citaId ?? null,
                estado: 'borrador',
            });
            return em.save(informe);
        });
    }

    async updateInforme(psychologistId: string, id: string, dto: UpdateInformeDto) {
        const informe = await this.assertInformeOwned(psychologistId, id);
        if (informe.estado === 'finalizado')
            throw new ForbiddenException('El informe ya está finalizado y no puede editarse');
        Object.assign(informe, {
            ...(dto.tipo !== undefined && { tipo: dto.tipo }),
            ...(dto.titulo !== undefined && { titulo: dto.titulo }),
            ...(dto.motivo !== undefined && { motivo: dto.motivo }),
            ...(dto.antecedentes !== undefined && { antecedentes: dto.antecedentes }),
            ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
            ...(dto.recomendaciones !== undefined && { recomendaciones: dto.recomendaciones }),
            ...(dto.derivadoA !== undefined && { derivadoA: dto.derivadoA }),
            ...(dto.confidencial !== undefined && { confidencial: dto.confidencial }),
        });
        return this.informeRepo.save(informe);
    }

    async finalizeInforme(psychologistId: string, id: string) {
        const informe = await this.assertInformeOwned(psychologistId, id);
        if (informe.estado === 'finalizado') return informe;
        informe.estado = 'finalizado';
        informe.finalizadoAt = new Date();
        return this.informeRepo.save(informe);
    }

    async deleteInforme(psychologistId: string, id: string): Promise<void> {
        const informe = await this.assertInformeOwned(psychologistId, id);
        if (informe.estado === 'finalizado')
            throw new ForbiddenException('No se puede eliminar un informe finalizado');
        await this.informeRepo.remove(informe);
    }

    async findInformeById(psychologistId: string, id: string) {
        return this.assertInformeOwned(psychologistId, id);
    }

    async listInformesByStudent(
        psychologistId: string,
        studentId: string,
        q: PageQueryDto,
    ) {
        const assigned = await this.isAssigned(psychologistId, studentId);
        if (!assigned) return this.emptyPage(q.limit ?? 25);

        const page = q.page ?? 1;
        const limit = q.limit ?? 25;
        const where: Record<string, any> = { studentId };

        if (q.sinCita === 'true') where['citaId'] = IsNull();
        else if (q.citaId !== undefined) where['citaId'] = q.citaId;

        const [items, total] = await this.informeRepo.findAndCount({
            where, order: { createdAt: 'DESC' },
            skip: (page - 1) * limit, take: limit,
        });
        return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
    }

    // ── Perfil para ficha del alumno ──────────────────────────────

    async getStudentProfile(psychologistId: string, studentId: string) {
        const rows = await this.dataSource.query<any[]>(
            `SELECT
                a.id, a.codigo_estudiante, a.nombre,
                a.apellido_paterno, a.apellido_materno,
                a.foto_storage_key,
                g.nombre  AS grado_nombre,
                g.orden   AS grado_orden,
                s.nombre  AS seccion_nombre,
                pa.activo AS en_seguimiento,
                pa.desde  AS desde
             FROM alumnos a
             LEFT JOIN matriculas       m  ON m.alumno_id = a.id AND m.activo = TRUE
             LEFT JOIN secciones        s  ON s.id = m.seccion_id
             LEFT JOIN grados           g  ON g.id = s.grado_id
             LEFT JOIN psicologa_alumno pa ON pa.alumno_id = a.id AND pa.psicologa_id = $2
             WHERE a.id = $1
             LIMIT 1`,
            [studentId, psychologistId],
        );
        if (!rows[0]) throw new NotFoundException('Alumno no encontrado');
        const r = rows[0];
        return {
            id: r.id,
            codigoEstudiante: r.codigo_estudiante,
            nombre: r.nombre,
            apellidoPaterno: r.apellido_paterno,
            apellidoMaterno: r.apellido_materno ?? null,
            fotoUrl: r.foto_storage_key
                ? this.storage.getPublicUrl(r.foto_storage_key)
                : null,
            grado: r.grado_nombre ? { nombre: r.grado_nombre, orden: r.grado_orden } : null,
            seccion: r.seccion_nombre ? { nombre: r.seccion_nombre } : null,
            enSeguimiento: r.en_seguimiento ?? false,
            desde: r.desde ?? null,
        };
    }

    // ── Helpers ───────────────────────────────────────────────────

    private async isAssigned(psychologistId: string, studentId: string) {
        return this.assignmentRepo.exist({
            where: { psychologistId, studentId, activo: true },
        });
    }

    private async assertInformeOwned(psychologistId: string, id: string) {
        const informe = await this.informeRepo.findOne({ where: { id } });
        if (!informe) throw new NotFoundException('Informe no encontrado');
        if (informe.psychologistId !== psychologistId)
            throw new ForbiddenException('Este informe pertenece a otra psicóloga');
        return informe;
    }

    private async upsertAssignment(em: any, psychologistId: string, studentId: string) {
        await em.query(
            `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
             VALUES ($1, $2, TRUE, CURRENT_DATE)
             ON CONFLICT (psicologa_id, alumno_id)
             DO UPDATE SET activo = TRUE, hasta = NULL`,
            [psychologistId, studentId],
        );
    }

    private emptyPage(limit: number) {
        return { data: [], total: 0, page: 1, limit, totalPages: 1 };
    }

    private stripCredentials<T extends Record<string, any>>(row: T) {
        const { codigo_acceso, numero_documento, tipo_documento, ...safe } = row;
        return safe as any;
    }
}