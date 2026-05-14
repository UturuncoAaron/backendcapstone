import {
    Injectable, Logger, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PsychologistStudent } from './entities/psychologist-student.entity.js';
import { PsychologyRecord } from './entities/psychology-record.entity.js';
import { InformePsicologico } from './entities/informe-psicologico.entity.js';
import {
    CreateRecordDto, UpdateRecordDto, PageQueryDto,
    CreateInformeDto, UpdateInformeDto,
} from './dto/psychology.dto.js';
import { UsersService } from '../users/users.service.js';

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
        private readonly dataSource: DataSource,
        private readonly usersService: UsersService,
    ) { }

    // ════════════════════════════════════════════════════════════════
    // FICHAS PSICOLÓGICAS
    // ════════════════════════════════════════════════════════════════

    async createRecord(psychologistId: string, dto: CreateRecordDto): Promise<PsychologyRecord> {
        return this.dataSource.transaction(async (em) => {
            await em.query(
                `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
                 VALUES ($1, $2, TRUE, CURRENT_DATE)
                 ON CONFLICT (psicologa_id, alumno_id)
                 DO UPDATE SET activo = TRUE, hasta = NULL`,
                [psychologistId, dto.studentId],
            );
            const record = em.create(PsychologyRecord, { ...dto, psychologistId });
            return em.save(record);
        });
    }

    async getRecordsByStudent(
        psychologistId: string,
        studentId: string,
        q: PageQueryDto,
    ) {
        await this.assertAssigned(psychologistId, studentId);
        const page = q.page ?? 1;
        const limit = q.limit ?? 25;

        const [items, total] = await this.recordRepo.findAndCount({
            where: { studentId },
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

    // ════════════════════════════════════════════════════════════════
    // ASIGNACIONES
    // ════════════════════════════════════════════════════════════════

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
            `SELECT
                a.id,
                a.codigo_estudiante,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                TRIM(CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno, ''))) AS apellidos,
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

    // ════════════════════════════════════════════════════════════════
    // DIRECTORIO
    // ════════════════════════════════════════════════════════════════

    async searchStudents(query: string) {
        const rows = await this.usersService.searchAlumnos(query);
        return rows.map((r: any) => this.stripCredentials(r));
    }

    async listStudents(q: { search?: string; page?: number; limit?: number }) {
        const result = await this.usersService.findAlumnos({
            q: q.search,
            page: q.page ?? 1,
            limit: q.limit ?? 50,
        });
        result.data = result.data.map((r: any) => this.stripCredentials(r));
        return result;
    }

    async searchParents(query: string) {
        const rows = await this.usersService.searchPadres(query);
        return rows.map((r: any) => this.stripCredentials(r));
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
                LOWER(ps.nombre)           LIKE $1 OR
                LOWER(ps.apellido_paterno) LIKE $1 OR
                LOWER(ps.apellido_materno) LIKE $1
            )`;
        }
        return this.dataSource.query(
            `SELECT ps.id,
                    ps.nombre,
                    ps.apellido_paterno,
                    ps.apellido_materno,
                    ps.especialidad,
                    ps.email,
                    ps.telefono,
                    ps.foto_storage_key
               FROM psicologas ps
               JOIN cuentas    c ON c.id = ps.id
              WHERE ${where}
              ORDER BY ps.apellido_paterno, ps.nombre`,
            params,
        );
    }

    // ════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════

    private async assertAssigned(psychologistId: string, studentId: string): Promise<void> {
        const exists = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
            select: ['psychologistId'],
        });
        if (!exists) {
            throw new ForbiddenException('Este alumno no está asignado a tu lista');
        }
    }

    private stripCredentials<T extends Record<string, any>>(
        row: T,
    ): Omit<T, 'codigo_acceso' | 'numero_documento' | 'tipo_documento'> {
        const { codigo_acceso, numero_documento, tipo_documento, ...safe } = row;
        return safe as any;
    }

    // ═════════════════════════════════════════════════════════════════
    // INFORMES PSICOLÓGICOS (evaluaciones / seguimiento / derivaciones)
    // ═════════════════════════════════════════════════════════════════

    async createInforme(
        psychologistId: string,
        dto: CreateInformeDto,
    ): Promise<InformePsicologico> {
        return this.dataSource.transaction(async (em) => {
            // Asegurar asignación para no perder rastro de quién tiene el caso.
            await em.query(
                `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
                 VALUES ($1, $2, TRUE, CURRENT_DATE)
                 ON CONFLICT (psicologa_id, alumno_id)
                 DO UPDATE SET activo = TRUE, hasta = NULL`,
                [psychologistId, dto.studentId],
            );
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
                estado: 'borrador',
            });
            return em.save(informe);
        });
    }

    async updateInforme(
        psychologistId: string,
        id: string,
        dto: UpdateInformeDto,
    ): Promise<InformePsicologico> {
        const informe = await this.assertInformeOwned(psychologistId, id);
        if (informe.estado === 'finalizado') {
            throw new ForbiddenException(
                'El informe ya está finalizado y no puede editarse',
            );
        }
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

    async finalizeInforme(
        psychologistId: string,
        id: string,
    ): Promise<InformePsicologico> {
        const informe = await this.assertInformeOwned(psychologistId, id);
        if (informe.estado === 'finalizado') return informe;
        informe.estado = 'finalizado';
        informe.finalizadoAt = new Date();
        return this.informeRepo.save(informe);
    }

    async deleteInforme(psychologistId: string, id: string): Promise<void> {
        const informe = await this.assertInformeOwned(psychologistId, id);
        if (informe.estado === 'finalizado') {
            throw new ForbiddenException(
                'No se puede eliminar un informe finalizado (auditoría)',
            );
        }
        await this.informeRepo.remove(informe);
    }

    async findInformeById(
        psychologistId: string,
        id: string,
    ): Promise<InformePsicologico> {
        return this.assertInformeOwned(psychologistId, id);
    }

    async listInformesByStudent(
        psychologistId: string,
        studentId: string,
        q: PageQueryDto,
    ) {
        await this.assertAssigned(psychologistId, studentId);
        const page = q.page ?? 1;
        const limit = q.limit ?? 25;
        const [items, total] = await this.informeRepo.findAndCount({
            where: { studentId },
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            data: items,
            total, page, limit,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    private async assertInformeOwned(
        psychologistId: string,
        id: string,
    ): Promise<InformePsicologico> {
        const informe = await this.informeRepo.findOne({ where: { id } });
        if (!informe) throw new NotFoundException('Informe no encontrado');
        if (informe.psychologistId !== psychologistId) {
            throw new ForbiddenException(
                'Este informe pertenece a otra psicóloga',
            );
        }
        return informe;
    }
}