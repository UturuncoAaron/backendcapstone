import {
    Injectable, NotFoundException, ForbiddenException,
    BadRequestException, Logger, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { AttendanceGeneral } from './entities/attendance-general.entity.js';
import { AttendanceClass } from './entities/attendance-class.entity.js';
import { AttendanceDocente } from './entities/attendance-docente.entity.js';
import type { EstadoAsistencia } from './entities/attendance-general.entity.js';
import {
    RegisterAsistenciaDto, BulkAsistenciaDto, UpdateAsistenciaDto,
    ListAsistenciasQueryDto, ReporteAsistenciaQueryDto, ScanQrDto,

} from './dto/asistencia.dto.js';
import { QrService } from '../qr/qr.service.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Injectable()
export class AssistsService {
    private readonly logger = new Logger(AssistsService.name);

    private readonly HORA_LIMITE_ENTRADA = '07:30';
    private periodoCache: { id: string; fecha_inicio: string; fecha_fin: string } | null = null;

    constructor(
        @InjectRepository(AttendanceGeneral)
        private readonly generalRepo: Repository<AttendanceGeneral>,
        @InjectRepository(AttendanceClass)
        private readonly classRepo: Repository<AttendanceClass>,
        @InjectRepository(AttendanceDocente)
        private readonly docenteRepo: Repository<AttendanceDocente>,
        private readonly dataSource: DataSource,
        private readonly qrService: QrService,
    ) { }

    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════

    private requireAuth(user: AuthUser | undefined): asserts user is AuthUser {
        if (!user?.id) throw new UnauthorizedException('Usuario no autenticado');
    }

    private async assertDocenteDelCurso(cursoId: string, user: AuthUser) {
        if (user.rol === 'admin') return;
        const rows = await this.dataSource.query<{ docente_id: string | null; activo: boolean }[]>(
            `SELECT docente_id, activo FROM cursos WHERE id = $1`,
            [cursoId],
        );
        if (!rows[0]) throw new NotFoundException(`Curso ${cursoId} no encontrado`);
        if (!rows[0].activo) throw new BadRequestException(`Curso ${cursoId} inactivo`);
        if (rows[0].docente_id !== user.id) {
            throw new ForbiddenException('Solo el docente del curso puede gestionar su asistencia');
        }
    }

    // 2. El método completo resolvePeriodoId
    private async resolvePeriodoId(fecha: string, periodoIdOpcional?: string): Promise<string> {
        if (periodoIdOpcional) return periodoIdOpcional;

        if (
            this.periodoCache &&
            fecha >= this.periodoCache.fecha_inicio &&
            fecha <= this.periodoCache.fecha_fin
        ) {
            return this.periodoCache.id;
        }

        const rows = await this.dataSource.query<{ id: string; fecha_inicio: string; fecha_fin: string }[]>(
            `SELECT id, fecha_inicio::text, fecha_fin::text FROM periodos
         WHERE $1::date BETWEEN fecha_inicio AND fecha_fin
         LIMIT 1`,
            [fecha],
        );

        if (!rows[0]) {
            throw new BadRequestException(
                `La fecha ${fecha} no cae dentro de ningún período bimestral. ` +
                `Verifica que el período esté configurado en el sistema.`,
            );
        }

        this.periodoCache = {
            id: rows[0].id,
            fecha_inicio: rows[0].fecha_inicio,
            fecha_fin: rows[0].fecha_fin,
        };
        this.logger.log(`Cache período → id=${rows[0].id} [${rows[0].fecha_inicio} → ${rows[0].fecha_fin}]`);
        return rows[0].id;
    }

    private async assertAlumnoEnSeccion(alumnoId: string, seccionId: string, fecha: string) {
        const anio = new Date(fecha + 'T12:00:00').getFullYear();
        const rows = await this.dataSource.query<{ ok: number }[]>(
            `SELECT 1 AS ok FROM matriculas
             WHERE alumno_id = $1 AND seccion_id = $2 AND anio = $3 AND activo = TRUE
             LIMIT 1`,
            [alumnoId, seccionId, anio],
        );
        if (!rows[0]) {
            throw new BadRequestException(
                `Alumno ${alumnoId} no está matriculado en la sección ${seccionId} para el año ${anio}`,
            );
        }
    }

    private async assertAlumnoEnCurso(alumnoId: string, cursoId: string) {
        const rows = await this.dataSource.query<{ ok: number }[]>(
            `SELECT 1 AS ok
             FROM cursos c
             JOIN matriculas m
               ON m.seccion_id = c.seccion_id
              AND m.anio = c.anio
             WHERE c.id = $1
               AND m.alumno_id = $2
               AND m.activo = TRUE
             LIMIT 1`,
            [cursoId, alumnoId],
        );
        if (!rows[0]) {
            throw new BadRequestException(`Alumno ${alumnoId} no está matriculado en este curso`);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // CORRECCIÓN: Uso estricto de QueryBuilder para evitar bugs 
    // de serialización de arrays con ANY($2::uuid[]) en Postgres
    // ─────────────────────────────────────────────────────────────────
    private async filtrarAlumnosEnSeccion(
        alumnoIds: string[], seccionId: string, fecha: string,
    ): Promise<{ validos: string[]; invalidos: string[] }> {
        if (!alumnoIds.length) return { validos: [], invalidos: [] };
        const anio = new Date(fecha + 'T12:00:00').getFullYear();

        const found = await this.dataSource.createQueryBuilder()
            .select('m.alumno_id', 'alumno_id')
            .from('matriculas', 'm')
            .where('m.seccion_id = :seccionId', { seccionId })
            .andWhere('m.anio = :anio', { anio })
            .andWhere('m.activo = TRUE')
            .andWhere('m.alumno_id IN (:...alumnoIds)', { alumnoIds })
            .getRawMany<{ alumno_id: string }>();

        const validos = new Set(found.map(r => r.alumno_id));
        return {
            validos: alumnoIds.filter(id => validos.has(id)),
            invalidos: alumnoIds.filter(id => !validos.has(id)),
        };
    }

    private async filtrarAlumnosEnCurso(
        alumnoIds: string[], cursoId: string,
    ): Promise<{ validos: string[]; invalidos: string[] }> {
        if (!alumnoIds.length) return { validos: [], invalidos: [] };

        // 1. Obtener datos del curso
        const cursoInfo = await this.dataSource.query<{ seccion_id: string; anio: number }[]>(
            `SELECT seccion_id, anio FROM cursos WHERE id = $1 AND activo = TRUE LIMIT 1`,
            [cursoId]
        );

        if (!cursoInfo.length) {
            this.logger.error(`[DEBUG] El curso ${cursoId} NO existe o tiene activo = FALSE`);
            return { validos: [], invalidos: alumnoIds };
        }

        const { seccion_id, anio } = cursoInfo[0];

        // --- LOG CLAVE 1 ---
        this.logger.warn(`[DEBUG-1] Evaluando Curso -> seccion_id: ${seccion_id} | anio: ${anio}`);
        this.logger.warn(`[DEBUG-2] Alumnos a evaluar: ${alumnoIds.length}`);

        // 2. Consulta RAW a prueba de balas para Postgres
        const found = await this.dataSource.query<{ alumno_id: string }[]>(
            `SELECT alumno_id 
             FROM matriculas 
             WHERE seccion_id = $1 
               AND anio = $2 
               AND activo = TRUE 
               AND alumno_id = ANY($3::uuid[])`,
            [seccion_id, anio, alumnoIds]
        );

        // --- LOG CLAVE 3 ---
        this.logger.warn(`[DEBUG-3] Matrículas válidas encontradas: ${found.length}`);

        if (found.length === 0) {
            this.logger.error(`[DEBUG-4] ¡Atención! Ningún alumno coincidió. Verifica si en la tabla 'matriculas' existe el anio=${anio} y seccion_id=${seccion_id} para estos alumnos.`);
        }

        const validosSet = new Set(found.map(r => String(r.alumno_id).toLowerCase()));

        return {
            validos: alumnoIds.filter(id => validosSet.has(String(id).toLowerCase())),
            invalidos: alumnoIds.filter(id => !validosSet.has(String(id).toLowerCase())),
        };
    }
    // ─────────────────────────────────────────────────────────────────

    private mapAlumnoScan(info: {
        alumno_id: string;
        nombre: string;
        apellido_paterno: string;
        apellido_materno: string;
        codigo_estudiante: string;
        foto_url: string | null;
        seccion_nombre: string;
    }) {
        const nombre_completo = [
            info.apellido_paterno, info.apellido_materno, info.nombre,
        ].filter(Boolean).join(' ');
        return {
            id: info.alumno_id,
            codigo_estudiante: info.codigo_estudiante,
            nombre_completo,
            foto_url: info.foto_url,
            seccion: info.seccion_nombre,
        };
    }

    // ════════════════════════════════════════════════════════════
    // ASISTENCIA GENERAL
    // ════════════════════════════════════════════════════════════

    private async assertTutorDeSeccion(seccionId: string, user: AuthUser) {
        if (user.rol === 'admin' || user.rol === 'auxiliar') {
            const rows = await this.dataSource.query<{ activo: boolean }[]>(
                `SELECT activo FROM secciones WHERE id = $1`, [seccionId],
            );
            if (!rows[0]) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
            if (!rows[0].activo) throw new BadRequestException(`Sección ${seccionId} inactiva`);
            return;
        }
        if (user.rol !== 'docente') {
            throw new ForbiddenException('Solo docente-tutor, auxiliar o admin pueden registrar asistencia general');
        }

        // Buscar tutor en secciones_tutores para el año activo
        const anio = await this.getAnioActual();
        const rows = await this.dataSource.query<{ activo: boolean; docente_id: string | null }[]>(
            `SELECT s.activo, st.docente_id
         FROM secciones s
         LEFT JOIN secciones_tutores st
           ON st.seccion_id = s.id AND st.anio = $2 AND st.activo = TRUE
         WHERE s.id = $1`,
            [seccionId, anio],
        );
        if (!rows[0]) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
        if (!rows[0].activo) throw new BadRequestException(`Sección ${seccionId} inactiva`);
        if (rows[0].docente_id !== user.id) {
            throw new ForbiddenException('Solo el tutor de la sección puede registrar asistencia general');
        }
    }
    async generalBulk(seccionId: string, dto: BulkAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertTutorDeSeccion(seccionId, user);
        if (!dto.alumnos.length) throw new BadRequestException('Lista vacía');

        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        const alumnoIds = dto.alumnos.map(a => a.alumno_id);

        const { validos, invalidos } = await this.filtrarAlumnosEnSeccion(
            alumnoIds, seccionId, dto.fecha,
        );

        if (invalidos.length) {
            this.logger.warn(
                `Bulk general: omitiendo ${invalidos.length} alumnos sin matrícula | sec ${seccionId}`,
            );
        }
        if (!validos.length) {
            throw new BadRequestException(
                'Ningún alumno está matriculado en esta sección para el año actual.',
            );
        }

        const validosSet = new Set(validos);
        const records = dto.alumnos
            .filter(a => validosSet.has(a.alumno_id))
            .map(a => ({
                alumno_id: a.alumno_id,
                seccion_id: seccionId,
                periodo_id,
                fecha: dto.fecha,
                estado: a.estado,
                observacion: a.observacion ?? null,
                registrado_por: user.id,
            }));

        await this.generalRepo.upsert(records, ['alumno_id', 'seccion_id', 'fecha']);

        this.logger.log(
            `Asist. general bulk: ${records.length} alumnos | sec ${seccionId} | ${dto.fecha}`,
        );
        return { registrados: records.length, omitidos: invalidos.length };
    }

    async generalScan(dto: ScanQrDto, user: AuthUser) {
        this.requireAuth(user);

        const verified = this.qrService.verifyAttendanceToken(dto.qr_token);
        if (!verified) throw new BadRequestException('QR inválido o no reconocido');

        const fecha = dto.fecha ?? new Date().toLocaleDateString('en-CA', {
            timeZone: 'America/Lima',
        });
        const anio = new Date(fecha + 'T12:00:00').getFullYear();
        const periodo_id = await this.resolvePeriodoId(fecha);

        const rows = await this.dataSource.query<{
            alumno_id: string;
            nombre: string;
            apellido_paterno: string;
            apellido_materno: string;
            codigo_estudiante: string;
            foto_url: string | null;
            seccion_id: string;
            seccion_nombre: string;
        }[]>(
            `SELECT
                al.id              AS alumno_id,
                al.nombre,
                al.apellido_paterno,
                al.apellido_materno,
                al.codigo_estudiante,
                al.foto_storage_key AS foto_url,
                s.id               AS seccion_id,
                s.nombre           AS seccion_nombre
             FROM alumnos al
             JOIN matriculas m ON m.alumno_id = al.id
                              AND m.anio = $2
                              AND m.activo = TRUE
             JOIN secciones s ON s.id = m.seccion_id
             WHERE al.id = $1
             LIMIT 1`,
            [verified.alumnoId, anio],
        );

        const info = rows[0];
        if (!info) {
            throw new NotFoundException(
                'Alumno no encontrado o sin matrícula activa para el año actual',
            );
        }

        await this.assertTutorDeSeccion(info.seccion_id, user);

        const existing = await this.generalRepo.findOne({
            where: { alumno_id: info.alumno_id, seccion_id: info.seccion_id, fecha },
        });

        if (existing) {
            return {
                duplicate: true,
                attendance: existing,
                alumno: this.mapAlumnoScan(info),
            };
        }

        const horaLima = new Date().toLocaleTimeString('en-GB', {
            timeZone: 'America/Lima',
            hour: '2-digit',
            minute: '2-digit',
        });
        const estado: EstadoAsistencia =
            horaLima <= this.HORA_LIMITE_ENTRADA ? 'asistio' : 'tardanza';

        const record = {
            alumno_id: info.alumno_id,
            seccion_id: info.seccion_id,
            periodo_id,
            fecha,
            estado,
            observacion: null as string | null,
            registrado_por: user.id,
        };

        await this.generalRepo.upsert(record, ['alumno_id', 'seccion_id', 'fecha']);

        this.logger.log(
            `Scan QR ✓ alumno=${info.alumno_id} sec=${info.seccion_id} estado=${estado} hora=${horaLima}`,
        );

        return {
            duplicate: false,
            attendance: record,
            alumno: this.mapAlumnoScan(info),
        };
    }

    async generalListBySeccion(seccionId: string, q: ListAsistenciasQueryDto) {
        if (q.fecha) {
            return this.generalRepo.find({
                where: { seccion_id: seccionId, fecha: q.fecha },
                relations: ['alumno'],
                order: { created_at: 'ASC' },
                take: q.limit ?? 200,
                skip: q.offset ?? 0,
            });
        }
        const where: any = { seccion_id: seccionId };
        if (q.desde && q.hasta) where.fecha = Between(q.desde, q.hasta);
        return this.generalRepo.find({
            where,
            relations: ['alumno'],
            order: { fecha: 'DESC', created_at: 'ASC' },
            take: q.limit ?? 200,
            skip: q.offset ?? 0,
        });
    }

    async generalListByAlumno(alumnoId: string, q: ListAsistenciasQueryDto) {
        const qb = this.generalRepo.createQueryBuilder('a')
            .leftJoinAndSelect('a.seccion', 's')
            .where('a.alumno_id = :alumnoId', { alumnoId })
            .orderBy('a.fecha', 'DESC')
            .take(q.limit ?? 200)
            .skip(q.offset ?? 0);
        if (q.desde) qb.andWhere('a.fecha >= :desde', { desde: q.desde });
        if (q.hasta) qb.andWhere('a.fecha <= :hasta', { hasta: q.hasta });
        return qb.getMany();
    }

    async generalUpdate(id: string, dto: UpdateAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        const a = await this.generalRepo.findOne({ where: { id } });
        if (!a) throw new NotFoundException(`Asistencia ${id} no encontrada`);
        await this.assertTutorDeSeccion(a.seccion_id, user);
        if (dto.estado !== undefined) a.estado = dto.estado;
        if (dto.observacion !== undefined) a.observacion = dto.observacion;
        return this.generalRepo.save(a);
    }

    async generalRemove(id: string, user: AuthUser) {
        this.requireAuth(user);
        const a = await this.generalRepo.findOne({ where: { id } });
        if (!a) throw new NotFoundException(`Asistencia ${id} no encontrada`);
        await this.assertTutorDeSeccion(a.seccion_id, user);
        await this.generalRepo.remove(a);
        return { ok: true };
    }

    // ════════════════════════════════════════════════════════════
    // ASISTENCIA POR CURSO
    // ════════════════════════════════════════════════════════════

    async classRegister(cursoId: string, dto: RegisterAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertDocenteDelCurso(cursoId, user);
        await this.assertAlumnoEnCurso(dto.alumno_id, cursoId);
        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);

        const record = {
            alumno_id: dto.alumno_id,
            curso_id: cursoId,
            periodo_id,
            fecha: dto.fecha,
            estado: dto.estado,
            observacion: dto.observacion ?? null,
            registrado_por: user.id,
        };
        await this.classRepo.upsert(record, ['alumno_id', 'curso_id', 'fecha']);
        return record;
    }

    async classBulk(cursoId: string, dto: BulkAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertDocenteDelCurso(cursoId, user);
        if (!dto.alumnos.length) throw new BadRequestException('Lista vacía');

        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        const alumnoIds = dto.alumnos.map(a => a.alumno_id);

        const { validos, invalidos } = await this.filtrarAlumnosEnCurso(alumnoIds, cursoId);

        if (invalidos.length) {
            this.logger.warn(`Bulk curso: omitiendo ${invalidos.length} alumnos sin matrícula`);
        }
        if (!validos.length) {
            throw new BadRequestException('Ningún alumno está matriculado en este curso para el año actual.');
        }

        const validosSet = new Set(validos);
        const records = dto.alumnos
            .filter(a => validosSet.has(a.alumno_id))
            .map(a => ({
                alumno_id: a.alumno_id,
                curso_id: cursoId,
                periodo_id,
                fecha: dto.fecha,
                estado: a.estado,
                observacion: a.observacion ?? null,
                registrado_por: user.id,
            }));

        await this.classRepo.upsert(records, ['alumno_id', 'curso_id', 'fecha']);

        this.logger.log(`Asist. curso bulk: ${records.length} alumnos | curso ${cursoId} | ${dto.fecha}`);
        return { registrados: records.length, omitidos: invalidos.length };
    }

    async classListByCurso(cursoId: string, q: ListAsistenciasQueryDto) {
        if (q.fecha) {
            return this.classRepo.find({
                where: { curso_id: cursoId, fecha: q.fecha },
                relations: ['alumno'],
                order: { created_at: 'ASC' },
                take: q.limit ?? 200,
                skip: q.offset ?? 0,
            });
        }
        const where: any = { curso_id: cursoId };
        if (q.desde && q.hasta) where.fecha = Between(q.desde, q.hasta);
        if (q.periodo_id) where.periodo_id = q.periodo_id;   // ← agregar
        return this.classRepo.find({
            where,
            relations: ['alumno'],
            order: { fecha: 'DESC', created_at: 'ASC' },
            take: q.limit ?? 200,
            skip: q.offset ?? 0,
        });
    }
    async classListByAlumno(alumnoId: string, q: ListAsistenciasQueryDto & { cursoId?: string }) {
        const qb = this.classRepo.createQueryBuilder('a')
            .leftJoinAndSelect('a.curso', 'c')
            .where('a.alumno_id = :alumnoId', { alumnoId })
            .orderBy('a.fecha', 'DESC')
            .take(q.limit ?? 200)
            .skip(q.offset ?? 0);
        if (q.cursoId) qb.andWhere('a.curso_id = :cursoId', { cursoId: q.cursoId });
        if (q.desde) qb.andWhere('a.fecha >= :desde', { desde: q.desde });
        if (q.hasta) qb.andWhere('a.fecha <= :hasta', { hasta: q.hasta });
        return qb.getMany();
    }

    async classUpdate(id: string, dto: UpdateAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        const a = await this.classRepo.findOne({ where: { id } });
        if (!a) throw new NotFoundException(`Asistencia ${id} no encontrada`);
        await this.assertDocenteDelCurso(a.curso_id, user);
        if (dto.estado !== undefined) a.estado = dto.estado;
        if (dto.observacion !== undefined) a.observacion = dto.observacion;
        return this.classRepo.save(a);
    }

    async classRemove(id: string, user: AuthUser) {
        this.requireAuth(user);
        const a = await this.classRepo.findOne({ where: { id } });
        if (!a) throw new NotFoundException(`Asistencia ${id} no encontrada`);
        await this.assertDocenteDelCurso(a.curso_id, user);
        await this.classRepo.remove(a);
        return { ok: true };
    }
    // ════════════════════════════════════════════════════════════
    // REPORTE
    // ════════════════════════════════════════════════════════════

    async reporte(q: ReporteAsistenciaQueryDto) {
        if (!q.seccion_id && !q.curso_id) {
            throw new BadRequestException('Envía seccion_id o curso_id');
        }
        if (q.seccion_id && q.curso_id) {
            throw new BadRequestException('Envía solo uno: seccion_id o curso_id, no ambos');
        }

        if (q.seccion_id) {
            return this.dataSource.query(
                `SELECT
                    a.alumno_id,
                    al.codigo_estudiante,
                    al.apellido_paterno,
                    al.apellido_materno,
                    al.nombre,
                    SUM(CASE WHEN a.estado = 'asistio'     THEN 1 ELSE 0 END) AS asistio,
                    SUM(CASE WHEN a.estado = 'falta'       THEN 1 ELSE 0 END) AS falta,
                    SUM(CASE WHEN a.estado = 'tardanza'    THEN 1 ELSE 0 END) AS tardanza,
                    SUM(CASE WHEN a.estado = 'justificado' THEN 1 ELSE 0 END) AS justificado,
                    COUNT(*) AS total_dias,
                    ROUND(
                        100.0 * SUM(CASE WHEN a.estado IN ('asistio','tardanza','justificado') THEN 1 ELSE 0 END)
                        / NULLIF(COUNT(*), 0), 2
                    ) AS pct_asistencia
                 FROM asistencias_generales a
                 JOIN alumnos al ON al.id = a.alumno_id
                 WHERE a.seccion_id = $1 AND a.periodo_id = $2
                 GROUP BY a.alumno_id, al.codigo_estudiante,
                          al.apellido_paterno, al.apellido_materno, al.nombre
                 ORDER BY al.apellido_paterno, al.apellido_materno, al.nombre`,
                [q.seccion_id, q.periodo_id],
            );
        }

        return this.dataSource.query(
            `SELECT
                a.alumno_id,
                al.codigo_estudiante,
                al.apellido_paterno,
                al.apellido_materno,
                al.nombre,
                SUM(CASE WHEN a.estado = 'asistio'     THEN 1 ELSE 0 END) AS asistio,
                SUM(CASE WHEN a.estado = 'falta'       THEN 1 ELSE 0 END) AS falta,
                SUM(CASE WHEN a.estado = 'tardanza'    THEN 1 ELSE 0 END) AS tardanza,
                SUM(CASE WHEN a.estado = 'justificado' THEN 1 ELSE 0 END) AS justificado,
                COUNT(*) AS total_clases,
                ROUND(
                    100.0 * SUM(CASE WHEN a.estado IN ('asistio','tardanza','justificado') THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0), 2
                ) AS pct_asistencia
             FROM asistencias_curso a
             JOIN alumnos al ON al.id = a.alumno_id
             WHERE a.curso_id = $1 AND a.periodo_id = $2
             GROUP BY a.alumno_id, al.codigo_estudiante,
                      al.apellido_paterno, al.apellido_materno, al.nombre
             ORDER BY al.apellido_paterno, al.apellido_materno, al.nombre`,
            [q.curso_id, q.periodo_id],
        );
    }
    private async getAnioActual(): Promise<number> {
        const [row] = await this.dataSource.query<{ anio: number }[]>(
            `SELECT anio FROM anios_lectivos WHERE estado = 'en_curso' LIMIT 1`,
        );
        return row?.anio ?? new Date().getFullYear();
    }

    async generalRegister(seccionId: string, dto: RegisterAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertTutorDeSeccion(seccionId, user);
        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        await this.assertAlumnoEnSeccion(dto.alumno_id, seccionId, dto.fecha);

        const record = {
            alumno_id: dto.alumno_id,
            seccion_id: seccionId,
            periodo_id,
            fecha: dto.fecha,
            estado: dto.estado,
            observacion: dto.observacion ?? null,
            registrado_por: user.id,
        };
        await this.generalRepo.upsert(record, ['alumno_id', 'seccion_id', 'fecha']);
        return record;
    }
}