import {
    Injectable, NotFoundException, ForbiddenException,
    BadRequestException, Logger, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { AttendanceGeneral } from './entities/attendance-general.entity.js';
import { AttendanceClass } from './entities/attendance-class.entity.js';
import type { EstadoAsistencia } from './entities/attendance-general.entity.js';
import {
    RegisterAsistenciaDto, BulkAsistenciaDto, UpdateAsistenciaDto,
    ListAsistenciasQueryDto, ReporteAsistenciaQueryDto, ScanQrDto,
} from './dto/asistencia.dto.js';
import { QrService } from '../qr/qr.service.js';

export interface AuthUser {
    sub: string;
    rol: 'alumno' | 'docente' | 'admin' | 'padre' | 'psicologa' | 'auxiliar';
}

@Injectable()
export class AssistsService {
    private readonly logger = new Logger(AssistsService.name);

    /** Hora límite para 'asistio'. Después de esto: 'tardanza'. */
    private readonly HORA_LIMITE_ENTRADA = '07:30';

    constructor(
        @InjectRepository(AttendanceGeneral)
        private readonly generalRepo: Repository<AttendanceGeneral>,
        @InjectRepository(AttendanceClass)
        private readonly classRepo: Repository<AttendanceClass>,
        private readonly dataSource: DataSource,
        private readonly qrService: QrService,
    ) { }

    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════

    /** Garantiza que la request viene de un usuario autenticado. */
    private requireAuth(user: AuthUser | undefined): asserts user is AuthUser {
        if (!user?.sub) throw new UnauthorizedException('Usuario no autenticado');
    }

    /** Solo el docente del curso (o admin) puede gestionar asistencia por curso. */
    private async assertDocenteDelCurso(cursoId: string, user: AuthUser) {
        if (user.rol === 'admin') return;

        const rows = await this.dataSource.query<{ docente_id: string | null; activo: boolean }[]>(
            `SELECT docente_id, activo FROM cursos WHERE id = $1`,
            [cursoId],
        );
        if (!rows[0]) throw new NotFoundException(`Curso ${cursoId} no encontrado`);
        if (!rows[0].activo) throw new BadRequestException(`Curso ${cursoId} inactivo`);
        if (rows[0].docente_id !== user.sub) {
            throw new ForbiddenException('Solo el docente del curso puede gestionar su asistencia');
        }
    }

    /** Asistencia general: admin/auxiliar siempre, docente solo si es tutor de la sección. */
    private async assertTutorDeSeccion(seccionId: string, user: AuthUser) {
        if (user.rol === 'admin' || user.rol === 'auxiliar') {
            const rows = await this.dataSource.query<{ activo: boolean }[]>(
                `SELECT activo FROM secciones WHERE id = $1`,
                [seccionId],
            );
            if (!rows[0]) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
            if (!rows[0].activo) throw new BadRequestException(`Sección ${seccionId} inactiva`);
            return;
        }

        if (user.rol !== 'docente') {
            throw new ForbiddenException('Solo docente-tutor, auxiliar o admin pueden registrar asistencia general');
        }

        const rows = await this.dataSource.query<{ tutor_id: string | null; activo: boolean }[]>(
            `SELECT tutor_id, activo FROM secciones WHERE id = $1`,
            [seccionId],
        );
        if (!rows[0]) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
        if (!rows[0].activo) throw new BadRequestException(`Sección ${seccionId} inactiva`);
        if (rows[0].tutor_id !== user.sub) {
            throw new ForbiddenException('Solo el tutor de la sección puede registrar asistencia general');
        }
    }

    /** Resuelve el periodo (bimestre) que contiene la fecha dada, o devuelve el provisto. */
    private async resolvePeriodoId(fecha: string, periodoIdOpcional?: string): Promise<string> {
        if (periodoIdOpcional) return periodoIdOpcional;
        const rows = await this.dataSource.query<{ id: string }[]>(
            `SELECT id FROM periodos
             WHERE $1::date BETWEEN fecha_inicio AND fecha_fin
             LIMIT 1`,
            [fecha],
        );
        if (!rows[0]) {
            throw new BadRequestException(
                `La fecha ${fecha} no cae dentro de ningún periodo (bimestre).`,
            );
        }
        return rows[0].id;
    }

    /** Verifica que el alumno esté matriculado y activo en la sección/periodo. */
    private async assertAlumnoEnSeccion(alumnoId: string, seccionId: string, periodoId: string) {
        const rows = await this.dataSource.query<{ ok: number }[]>(
            `SELECT 1 AS ok FROM matriculas
             WHERE alumno_id = $1 AND seccion_id = $2 AND periodo_id = $3 AND activo = TRUE
             LIMIT 1`,
            [alumnoId, seccionId, periodoId],
        );
        if (!rows[0]) {
            throw new BadRequestException(
                `Alumno ${alumnoId} no está matriculado en la sección ${seccionId} para este periodo`,
            );
        }
    }

    /** Verifica que el alumno esté matriculado en la sección a la que pertenece el curso. */
    private async assertAlumnoEnCurso(alumnoId: string, cursoId: string) {
        const rows = await this.dataSource.query<{ ok: number }[]>(
            `SELECT 1 AS ok
             FROM cursos c
             JOIN matriculas m
               ON m.seccion_id = c.seccion_id
              AND m.periodo_id = c.periodo_id
             WHERE c.id = $1
               AND m.alumno_id = $2
               AND m.activo = TRUE
             LIMIT 1`,
            [cursoId, alumnoId],
        );
        if (!rows[0]) {
            throw new BadRequestException(
                `Alumno ${alumnoId} no está matriculado en este curso`,
            );
        }
    }

    /** Particiona una lista de alumnos en (matriculados / no matriculados) en una sección. */
    private async filtrarAlumnosEnSeccion(
        alumnoIds: string[], seccionId: string, periodoId: string,
    ): Promise<{ validos: string[]; invalidos: string[] }> {
        const found = await this.dataSource.query<{ alumno_id: string }[]>(
            `SELECT alumno_id FROM matriculas
             WHERE seccion_id = $1 AND periodo_id = $2 AND activo = TRUE
               AND alumno_id = ANY($3::uuid[])`,
            [seccionId, periodoId, alumnoIds],
        );
        const validos = new Set(found.map(r => r.alumno_id));
        return {
            validos: alumnoIds.filter(id => validos.has(id)),
            invalidos: alumnoIds.filter(id => !validos.has(id)),
        };
    }

    /** Particiona una lista de alumnos en (matriculados / no matriculados) en un curso. */
    private async filtrarAlumnosEnCurso(
        alumnoIds: string[], cursoId: string,
    ): Promise<{ validos: string[]; invalidos: string[] }> {
        const found = await this.dataSource.query<{ alumno_id: string }[]>(
            `SELECT m.alumno_id
             FROM cursos c
             JOIN matriculas m
               ON m.seccion_id = c.seccion_id
              AND m.periodo_id = c.periodo_id
             WHERE c.id = $1
               AND m.activo = TRUE
               AND m.alumno_id = ANY($2::uuid[])`,
            [cursoId, alumnoIds],
        );
        const validos = new Set(found.map(r => r.alumno_id));
        return {
            validos: alumnoIds.filter(id => validos.has(id)),
            invalidos: alumnoIds.filter(id => !validos.has(id)),
        };
    }

    /** Estructura compacta del alumno para devolver al UI del scan. */
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

    /** Registra/actualiza la asistencia general de un alumno (idempotente por upsert). */
    async generalRegister(seccionId: string, dto: RegisterAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertTutorDeSeccion(seccionId, user);
        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        await this.assertAlumnoEnSeccion(dto.alumno_id, seccionId, periodo_id);

        await this.generalRepo.upsert(
            {
                alumno_id: dto.alumno_id,
                seccion_id: seccionId,
                periodo_id,
                fecha: dto.fecha,
                estado: dto.estado,
                observacion: dto.observacion ?? null,
                registrado_por: user.sub,
            },
            ['alumno_id', 'seccion_id', 'fecha'],
        );

        return this.generalRepo.findOne({
            where: { alumno_id: dto.alumno_id, seccion_id: seccionId, fecha: dto.fecha },
        });
    }

    /** Registra/actualiza asistencia general en bloque para varios alumnos. */
    async generalBulk(seccionId: string, dto: BulkAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertTutorDeSeccion(seccionId, user);
        if (!dto.alumnos.length) throw new BadRequestException('Lista vacía');

        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        const alumnoIds = dto.alumnos.map(a => a.alumno_id);
        const { invalidos } = await this.filtrarAlumnosEnSeccion(alumnoIds, seccionId, periodo_id);
        if (invalidos.length) {
            throw new BadRequestException(
                `Alumnos no matriculados en esta sección/periodo: ${invalidos.join(', ')}`,
            );
        }

        const records = dto.alumnos.map(a => ({
            alumno_id: a.alumno_id,
            seccion_id: seccionId,
            periodo_id,
            fecha: dto.fecha,
            estado: a.estado,
            observacion: a.observacion ?? null,
            registrado_por: user.sub,
        }));

        await this.generalRepo.upsert(records, ['alumno_id', 'seccion_id', 'fecha']);

        this.logger.log(
            `Asist. general bulk: ${records.length} alumnos | sec ${seccionId} | ${dto.fecha}`,
        );
        return { registrados: records.length };
    }

    /** Verifica QR del carnet, resuelve sección activa y marca asistencia automática. */
    async generalScan(dto: ScanQrDto, user: AuthUser) {
        this.requireAuth(user);

        const verified = this.qrService.verifyAttendanceToken(dto.qr_token);
        if (!verified) {
            throw new BadRequestException('QR inválido o no reconocido');
        }

        const fecha = dto.fecha ?? new Date().toISOString().slice(0, 10);
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
                al.id  AS alumno_id,
                al.nombre,
                al.apellido_paterno,
                al.apellido_materno,
                al.codigo_estudiante,
                al.foto_url,
                s.id   AS seccion_id,
                s.nombre AS seccion_nombre
             FROM alumnos al
             JOIN matriculas m
               ON m.alumno_id = al.id
              AND m.periodo_id = $2
              AND m.activo = TRUE
             JOIN secciones s ON s.id = m.seccion_id
             WHERE al.id = $1
             LIMIT 1`,
            [verified.alumnoId, periodo_id],
        );

        const info = rows[0];
        if (!info) {
            throw new NotFoundException(
                'Alumno no encontrado o sin matrícula activa en el periodo actual',
            );
        }

        await this.assertTutorDeSeccion(info.seccion_id, user);

        const existing = await this.generalRepo.findOne({
            where: {
                alumno_id: info.alumno_id,
                seccion_id: info.seccion_id,
                fecha,
            },
        });

        if (existing) {
            return {
                duplicate: true,
                attendance: existing,
                alumno: this.mapAlumnoScan(info),
            };
        }

        const ahora = new Date();
        const horaActual =
            String(ahora.getHours()).padStart(2, '0') + ':' +
            String(ahora.getMinutes()).padStart(2, '0');
        const estado: EstadoAsistencia =
            horaActual <= this.HORA_LIMITE_ENTRADA ? 'asistio' : 'tardanza';

        await this.generalRepo.upsert(
            {
                alumno_id: info.alumno_id,
                seccion_id: info.seccion_id,
                periodo_id,
                fecha,
                estado,
                observacion: null,
                registrado_por: user.sub,
            },
            ['alumno_id', 'seccion_id', 'fecha'],
        );

        const saved = await this.generalRepo.findOne({
            where: {
                alumno_id: info.alumno_id,
                seccion_id: info.seccion_id,
                fecha,
            },
        });

        this.logger.log(
            `Scan QR: alumno=${info.alumno_id} sec=${info.seccion_id} estado=${estado} por=${user.sub}`,
        );

        return {
            duplicate: false,
            attendance: saved,
            alumno: this.mapAlumnoScan(info),
        };
    }

    /** Lista los registros de asistencia general de una sección (por fecha o rango). */
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

    /** Lista las asistencias generales históricas de un alumno. */
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

    /** Modifica el estado u observación de un registro general existente. */
    async generalUpdate(id: string, dto: UpdateAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        const a = await this.generalRepo.findOne({ where: { id } });
        if (!a) throw new NotFoundException(`Asistencia ${id} no encontrada`);
        await this.assertTutorDeSeccion(a.seccion_id, user);
        if (dto.estado !== undefined) a.estado = dto.estado;
        if (dto.observacion !== undefined) a.observacion = dto.observacion;
        return this.generalRepo.save(a);
    }

    /** Elimina un registro de asistencia general. */
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

    /** Registra/actualiza la asistencia de un alumno en un curso. */
    async classRegister(cursoId: string, dto: RegisterAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertDocenteDelCurso(cursoId, user);
        await this.assertAlumnoEnCurso(dto.alumno_id, cursoId);
        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);

        await this.classRepo.upsert(
            {
                alumno_id: dto.alumno_id,
                curso_id: cursoId,
                periodo_id,
                fecha: dto.fecha,
                estado: dto.estado,
                observacion: dto.observacion ?? null,
                registrado_por: user.sub,
            },
            ['alumno_id', 'curso_id', 'fecha'],
        );

        return this.classRepo.findOne({
            where: { alumno_id: dto.alumno_id, curso_id: cursoId, fecha: dto.fecha },
        });
    }

    /** Registra/actualiza asistencia en bloque para varios alumnos en un curso. */
    async classBulk(cursoId: string, dto: BulkAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertDocenteDelCurso(cursoId, user);
        if (!dto.alumnos.length) throw new BadRequestException('Lista vacía');

        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        const alumnoIds = dto.alumnos.map(a => a.alumno_id);
        const { invalidos } = await this.filtrarAlumnosEnCurso(alumnoIds, cursoId);
        if (invalidos.length) {
            throw new BadRequestException(
                `Alumnos no matriculados en este curso: ${invalidos.join(', ')}`,
            );
        }

        const records = dto.alumnos.map(a => ({
            alumno_id: a.alumno_id,
            curso_id: cursoId,
            periodo_id,
            fecha: dto.fecha,
            estado: a.estado,
            observacion: a.observacion ?? null,
            registrado_por: user.sub,
        }));

        await this.classRepo.upsert(records, ['alumno_id', 'curso_id', 'fecha']);

        this.logger.log(
            `Asist. curso bulk: ${records.length} alumnos | curso ${cursoId} | ${dto.fecha}`,
        );
        return { registrados: records.length };
    }

    /** Lista las asistencias de un curso (por fecha o rango). */
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
        return this.classRepo.find({
            where,
            relations: ['alumno'],
            order: { fecha: 'DESC', created_at: 'ASC' },
            take: q.limit ?? 200,
            skip: q.offset ?? 0,
        });
    }

    /** Lista las asistencias históricas de un alumno (filtrable por curso). */
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

    /** Modifica el estado u observación de un registro de curso. */
    async classUpdate(id: string, dto: UpdateAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        const a = await this.classRepo.findOne({ where: { id } });
        if (!a) throw new NotFoundException(`Asistencia ${id} no encontrada`);
        await this.assertDocenteDelCurso(a.curso_id, user);
        if (dto.estado !== undefined) a.estado = dto.estado;
        if (dto.observacion !== undefined) a.observacion = dto.observacion;
        return this.classRepo.save(a);
    }

    /** Elimina un registro de asistencia de curso. */
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

    /** Genera reporte agregado de asistencias por sección o curso para Excel. */
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
                    COUNT(*)                                                  AS total_dias,
                    ROUND(
                        100.0 * SUM(CASE WHEN a.estado IN ('asistio','tardanza','justificado') THEN 1 ELSE 0 END)
                        / NULLIF(COUNT(*), 0), 2
                    ) AS pct_asistencia
                 FROM asistencias_generales a
                 JOIN alumnos al ON al.id = a.alumno_id
                 WHERE a.seccion_id = $1 AND a.periodo_id = $2
                 GROUP BY a.alumno_id, al.codigo_estudiante, al.apellido_paterno, al.apellido_materno, al.nombre
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
                COUNT(*)                                                  AS total_clases,
                ROUND(
                    100.0 * SUM(CASE WHEN a.estado IN ('asistio','tardanza','justificado') THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0), 2
                ) AS pct_asistencia
             FROM asistencias_curso a
             JOIN alumnos al ON al.id = a.alumno_id
             WHERE a.curso_id = $1 AND a.periodo_id = $2
             GROUP BY a.alumno_id, al.codigo_estudiante, al.apellido_paterno, al.apellido_materno, al.nombre
             ORDER BY al.apellido_paterno, al.apellido_materno, al.nombre`,
            [q.curso_id, q.periodo_id],
        );
    }
}