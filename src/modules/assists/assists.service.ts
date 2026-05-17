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
    BulkDocenteAsistenciaDto,
} from './dto/asistencia.dto.js';
import { QrService } from '../qr/qr.service.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Injectable()
export class AssistsService {
    private readonly logger = new Logger(AssistsService.name);

    private readonly HORA_LIMITE_ENTRADA = '07:30';

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
        const rows = await this.dataSource.query<{ tutor_id: string | null; activo: boolean }[]>(
            `SELECT tutor_id, activo FROM secciones WHERE id = $1`, [seccionId],
        );
        if (!rows[0]) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
        if (!rows[0].activo) throw new BadRequestException(`Sección ${seccionId} inactiva`);
        if (rows[0].tutor_id !== user.id) {
            throw new ForbiddenException('Solo el tutor de la sección puede registrar asistencia general');
        }
    }

    /** Resuelve el periodo (bimestre) por fecha — SOLO para asistencias, NO para matrículas. */
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
                `La fecha ${fecha} no cae dentro de ningún periodo (bimestre). ` +
                `Verifica que el periodo esté configurado en el sistema.`,
            );
        }
        return rows[0].id;
    }

    /**
     * Verifica que el alumno esté matriculado en la sección para el AÑO de la fecha.
     * Ya NO usa periodo_id — la matrícula es anual.
     */
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

    /**
     * Verifica que el alumno esté matriculado en la sección del curso para el AÑO del curso.
     * Usa el año del periodo del curso para la validación.
     */
    private async assertAlumnoEnCurso(alumnoId: string, cursoId: string) {
        const rows = await this.dataSource.query<{ ok: number }[]>(
            `SELECT 1 AS ok
             FROM cursos c
             JOIN periodos p ON p.id = c.periodo_id
             JOIN matriculas m
               ON m.seccion_id = c.seccion_id
              AND m.anio = p.anio
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

    /**
     * Filtra alumnos matriculados en una sección para el AÑO de la fecha dada.
     */
    private async filtrarAlumnosEnSeccion(
        alumnoIds: string[], seccionId: string, fecha: string,
    ): Promise<{ validos: string[]; invalidos: string[] }> {
        const anio = new Date(fecha + 'T12:00:00').getFullYear();
        const found = await this.dataSource.query<{ alumno_id: string }[]>(
            `SELECT alumno_id FROM matriculas
             WHERE seccion_id = $1 AND anio = $2 AND activo = TRUE
               AND alumno_id = ANY($3::uuid[])`,
            [seccionId, anio, alumnoIds],
        );
        const validos = new Set(found.map(r => r.alumno_id));
        return {
            validos: alumnoIds.filter(id => validos.has(id)),
            invalidos: alumnoIds.filter(id => !validos.has(id)),
        };
    }

    /**
     * Filtra alumnos matriculados en el año del curso.
     */
    private async filtrarAlumnosEnCurso(
        alumnoIds: string[], cursoId: string,
    ): Promise<{ validos: string[]; invalidos: string[] }> {
        const found = await this.dataSource.query<{ alumno_id: string }[]>(
            `SELECT m.alumno_id
             FROM cursos c
             JOIN periodos p ON p.id = c.periodo_id
             JOIN matriculas m
               ON m.seccion_id = c.seccion_id
              AND m.anio = p.anio
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

    async generalRegister(seccionId: string, dto: RegisterAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertTutorDeSeccion(seccionId, user);
        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        await this.assertAlumnoEnSeccion(dto.alumno_id, seccionId, dto.fecha);

        await this.generalRepo.upsert(
            {
                alumno_id: dto.alumno_id,
                seccion_id: seccionId,
                periodo_id,
                fecha: dto.fecha,
                estado: dto.estado,
                observacion: dto.observacion ?? null,
                registrado_por: user.id,
            },
            ['alumno_id', 'seccion_id', 'fecha'],
        );

        return this.generalRepo.findOne({
            where: { alumno_id: dto.alumno_id, seccion_id: seccionId, fecha: dto.fecha },
        });
    }

    async generalBulk(seccionId: string, dto: BulkAsistenciaDto, user: AuthUser) {
        this.requireAuth(user);
        await this.assertTutorDeSeccion(seccionId, user);
        if (!dto.alumnos.length) throw new BadRequestException('Lista vacía');

        const periodo_id = await this.resolvePeriodoId(dto.fecha, dto.periodo_id);
        const alumnoIds = dto.alumnos.map(a => a.alumno_id);

        // Filtra por año — ya no por periodo_id
        const { validos, invalidos } = await this.filtrarAlumnosEnSeccion(
            alumnoIds, seccionId, dto.fecha,
        );

        if (invalidos.length) {
            this.logger.warn(
                `Bulk general: omitiendo ${invalidos.length} alumnos sin matrícula activa | sec ${seccionId}`,
            );
        }

        if (!validos.length) {
            throw new BadRequestException(
                'Ningún alumno está matriculado en esta sección para el año actual. ' +
                'Verifica que las matrículas estén registradas.',
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

        const fecha = dto.fecha ?? new Date().toISOString().slice(0, 10);
        const periodo_id = await this.resolvePeriodoId(fecha);
        const anio = new Date(fecha + 'T12:00:00').getFullYear();

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
             JOIN matriculas m ON m.alumno_id = al.id AND m.anio = $2 AND m.activo = TRUE
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
            return { duplicate: true, attendance: existing, alumno: this.mapAlumnoScan(info) };
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
                registrado_por: user.id,
            },
            ['alumno_id', 'seccion_id', 'fecha'],
        );

        const saved = await this.generalRepo.findOne({
            where: { alumno_id: info.alumno_id, seccion_id: info.seccion_id, fecha },
        });

        this.logger.log(
            `Scan QR: alumno=${info.alumno_id} sec=${info.seccion_id} estado=${estado} por=${user.id}`,
        );

        return { duplicate: false, attendance: saved, alumno: this.mapAlumnoScan(info) };
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

        await this.classRepo.upsert(
            {
                alumno_id: dto.alumno_id,
                curso_id: cursoId,
                periodo_id,
                fecha: dto.fecha,
                estado: dto.estado,
                observacion: dto.observacion ?? null,
                registrado_por: user.id,
            },
            ['alumno_id', 'curso_id', 'fecha'],
        );

        return this.classRepo.findOne({
            where: { alumno_id: dto.alumno_id, curso_id: cursoId, fecha: dto.fecha },
        });
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
    // ASISTENCIA DOCENTE
    // ════════════════════════════════════════════════════════════

    async bulkDocenteAsistencia(dto: BulkDocenteAsistenciaDto) {
        if (!dto.registros.length) throw new BadRequestException('Lista vacía');

        const records = dto.registros.map(r =>
            this.docenteRepo.create({
                horario_id: r.horario_id,
                docente_id: r.docente_id,
                fecha: dto.fecha,
                estado: r.estado as any,
            }),
        );

        await this.docenteRepo
            .createQueryBuilder()
            .insert()
            .into(AttendanceDocente)
            .values(records)
            .orUpdate(['estado'], ['horario_id', 'fecha'])
            .execute();

        this.logger.log(`Asist. docente bulk: ${records.length} registros | ${dto.fecha}`);
        return { registrados: records.length };
    }

    async getHorariosDelDia(fechaParam?: string) {
        const fecha = fechaParam ?? new Date().toISOString().slice(0, 10);
        const diasMap: Record<number, string> = {
            0: 'domingo', 1: 'lunes', 2: 'martes',
            3: 'miercoles', 4: 'jueves', 5: 'viernes', 6: 'sabado',
        };
        const date = new Date(fecha + 'T12:00:00');
        const diaSemana = diasMap[date.getDay()];

        const rows = await this.dataSource.query<{
            horario_id: string;
            docente_id: string;
            docente_nombre: string;
            apellido_paterno: string;
            curso_nombre: string;
            seccion_nombre: string;
            hora_inicio: string;
            hora_fin: string;
            aula: string | null;
            estado_actual: string | null;
            hora_llegada: string | null;
            observacion: string | null;
        }[]>(
            `SELECT
                h.id           AS horario_id,
                d.id           AS docente_id,
                d.nombre       AS docente_nombre,
                d.apellido_paterno,
                c.nombre       AS curso_nombre,
                s.nombre       AS seccion_nombre,
                h.hora_inicio,
                h.hora_fin,
                h.aula,
                ad.estado      AS estado_actual,
                ad.hora_llegada,
                ad.observacion
             FROM horarios h
             JOIN cursos    c ON c.id = h.curso_id AND c.activo = TRUE
             JOIN secciones s ON s.id = c.seccion_id AND s.activo = TRUE
             JOIN docentes  d ON d.id = c.docente_id
             JOIN cuentas   cu ON cu.id = d.id AND cu.activo = TRUE
             LEFT JOIN asistencias_docente ad
               ON ad.horario_id = h.id AND ad.fecha = $1::date
             WHERE h.dia_semana = $2
             ORDER BY h.hora_inicio, d.apellido_paterno`,
            [fecha, diaSemana],
        );

        return rows.map(r => ({
            horario_id: r.horario_id,
            docente_id: r.docente_id,
            docente_nombre: r.docente_nombre,
            apellido_paterno: r.apellido_paterno,
            curso_nombre: r.curso_nombre,
            seccion_nombre: r.seccion_nombre,
            hora_inicio: r.hora_inicio,
            hora_fin: r.hora_fin,
            aula: r.aula,
            estado_actual: r.estado_actual ?? null,
            hora_llegada: r.hora_llegada ?? null,
            observacion: r.observacion ?? null,
        }));
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
                COUNT(*) AS total_clases,
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