import {
    Injectable,
    ForbiddenException,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
    RegistrarAsistenciaDocenteDto,
    RegistrarAsistenciaDocenteBulkDto,
    RegistrarAsistenciaDiariaDocenteDto,
    RegistrarAsistenciaDiariaBulkDto,
} from '../dto/teacher-attendance.dto.js';
import {
    SQL_DOCENTES_DEL_DIA,
    SQL_HORARIOS_DEL_DIA_V2,
    SQL_REPORTE_DIARIO_DOCENTES,
    SQL_RESUMEN_DOCENTES_RANGO,
    SQL_ALERTAS_AUSENCIAS_DOCENTE,
} from '../queries/reports.queries.js';
import type {
    HorarioDelDiaRow,
    AsistenciaDocenteDiariaRow,
    ResumenAsistenciaDocenteRow,
    AlertaAusenciaDocenteRow,
    DocenteDelDiaRow,
} from '../types/reports.types.js';

@Injectable()
export class TeacherAttendanceService {
    constructor(@InjectDataSource() private readonly ds: DataSource) { }

    // ─────────────────────────────────────────────────────────────────────
    // LECTURA — nueva: lista de docentes del día (1 fila por docente)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Lista los docentes que tienen clase hoy, con su primera y última clase.
     * El auxiliar usa esto para ver quién tiene clases y registrar una sola vez.
     */
    async getDocentesDelDia(
        user: AuthUser,
        fecha: string,
    ): Promise<DocenteDelDiaRow[]> {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(fecha);
        const rows = await this.ds.query(SQL_DOCENTES_DEL_DIA, [fecha]);
        return rows.map((r: any) => ({
            ...r,
            bloques_json: typeof r.bloques_json === 'string'
                ? JSON.parse(r.bloques_json)
                : r.bloques_json ?? [],
        }));
    }

    /**
     * Legacy: horarios del día bloque por bloque (mantener para reportes).
     */
    async getHorariosDia(
        user: AuthUser,
        fecha: string,
    ): Promise<HorarioDelDiaRow[]> {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(fecha);
        return this.ds.query(SQL_HORARIOS_DEL_DIA_V2, [fecha]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // ESCRITURA — nuevo: registro diario por docente
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Registro masivo diario por DOCENTE.
     *
     * El auxiliar envía el estado de cada docente UNA VEZ.
     * El servicio distribuye automáticamente a los bloques del horario:
     *
     * - presente/tardanza/ausente/permiso/licencia → todos los bloques del docente
     * - salida_anticipada → bloques antes de hora_salida → presente
     *                       bloques después de hora_salida → permiso + motivo
     *
     * Las horas libres entre clases NO se registran explícitamente —
     * el sistema solo registra los bloques reales del horario.
     */
    async registrarAsistenciaDiariaBulk(
        user: AuthUser,
        dto: RegistrarAsistenciaDiariaBulkDto,
    ): Promise<{ procesados: number; bloques_registrados: number; errores: any[] }> {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(dto.fecha);

        if (!dto.docentes?.length) {
            throw new BadRequestException('No se enviaron docentes');
        }

        // Obtener todos los horarios del día para todos los docentes de una sola query
        const docenteIds = dto.docentes.map(d => d.docente_id);
        const horariosDelDia = await this.getHorariosParaDocentes(dto.fecha, docenteIds);

        const queryRunner = this.ds.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        let bloquesRegistrados = 0;
        const errores: any[] = [];

        try {
            for (const docente of dto.docentes) {
                const horarios = horariosDelDia.filter(
                    h => h.docente_id === docente.docente_id,
                );

                if (!horarios.length) {
                    errores.push({
                        docente_id: docente.docente_id,
                        error: 'No tiene horarios programados para este día',
                    });
                    continue;
                }

                // Distribuir estado a cada bloque según la lógica de negocio
                const bloques = this.distribuirEstadoPorBloques(docente, horarios);

                for (const bloque of bloques) {
                    const sql = `
                        INSERT INTO asistencias_docente
                            (horario_id, docente_id, fecha, estado,
                             hora_llegada, hora_salida_anticipada,
                             tiene_justificacion, motivo_justificacion,
                             hubo_reemplazo, observacion, registrado_por)
                        VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9, $10, $11)
                        ON CONFLICT (horario_id, fecha) DO UPDATE SET
                            estado                  = EXCLUDED.estado,
                            hora_llegada            = EXCLUDED.hora_llegada,
                            hora_salida_anticipada  = EXCLUDED.hora_salida_anticipada,
                            tiene_justificacion     = EXCLUDED.tiene_justificacion,
                            motivo_justificacion    = EXCLUDED.motivo_justificacion,
                            hubo_reemplazo          = EXCLUDED.hubo_reemplazo,
                            observacion             = EXCLUDED.observacion,
                            registrado_por          = EXCLUDED.registrado_por,
                            updated_at              = NOW()
                    `;

                    await queryRunner.query(sql, [
                        bloque.horario_id,
                        docente.docente_id,
                        dto.fecha,
                        bloque.estado,
                        bloque.hora_llegada ?? null,
                        bloque.hora_salida_anticipada ?? null,
                        bloque.tiene_justificacion,
                        bloque.motivo ?? null,
                        docente.hubo_reemplazo ?? false,
                        docente.observacion ?? null,
                        user.id,
                    ]);

                    bloquesRegistrados++;
                }
            }

            await queryRunner.commitTransaction();

            return {
                procesados: dto.docentes.length - errores.length,
                bloques_registrados: bloquesRegistrados,
                errores,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // LÓGICA DE DISTRIBUCIÓN — corazón del sistema
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Dado el estado del docente para el día y sus bloques de horario,
     * devuelve qué estado asignar a cada bloque.
     *
     * Reglas:
     * - presente:          todos los bloques → presente
     * - tardanza:          todos los bloques → presente
     *                      (la tardanza se registra en hora_llegada del primer bloque)
     * - ausente:           todos los bloques → ausente
     * - permiso/licencia:  todos los bloques → permiso/licencia
     * - salida_anticipada: bloques que empiezan ANTES de hora_salida → presente
     *                      bloques que empiezan DESPUÉS de hora_salida → permiso
     *                      (horas libres entre clases = no aplican, no están en horario)
     */
    private distribuirEstadoPorBloques(
        docente: RegistrarAsistenciaDiariaDocenteDto,
        horarios: Array<{ horario_id: string; hora_inicio: string; hora_fin: string }>,
    ): Array<{
        horario_id: string;
        estado: string;
        hora_llegada?: string;
        hora_salida_anticipada?: string;
        tiene_justificacion: boolean;
        motivo?: string;
    }> {
        const { estado, hora_llegada, hora_salida_anticipada, motivo } = docente;

        return horarios.map((h, index) => {
            // Caso salida anticipada — divide el día en dos partes
            if (estado === 'salida_anticipada' && hora_salida_anticipada) {
                const estaAntes = h.hora_inicio < hora_salida_anticipada;

                if (estaAntes) {
                    return {
                        horario_id: h.horario_id,
                        estado: 'presente',
                        // hora_llegada solo en el primer bloque
                        hora_llegada: index === 0 ? hora_llegada : undefined,
                        hora_salida_anticipada: undefined,
                        tiene_justificacion: false,
                    };
                } else {
                    return {
                        horario_id: h.horario_id,
                        estado: 'permiso',
                        hora_llegada: undefined,
                        hora_salida_anticipada,
                        tiene_justificacion: !!motivo,
                        motivo: motivo ?? 'Salida anticipada autorizada por dirección',
                    };
                }
            }

            // Caso tardanza — estado presente en todos, hora_llegada en el primero
            if (estado === 'tardanza') {
                return {
                    horario_id: h.horario_id,
                    estado: index === 0 ? 'tardanza' : 'presente',
                    hora_llegada: index === 0 ? hora_llegada : undefined,
                    hora_salida_anticipada: undefined,
                    tiene_justificacion: false,
                };
            }

            // Caso ausente — con justificación si hay motivo
            if (estado === 'ausente') {
                return {
                    horario_id: h.horario_id,
                    estado: 'ausente',
                    hora_llegada: undefined,
                    hora_salida_anticipada: undefined,
                    tiene_justificacion: !!motivo,
                    motivo,
                };
            }

            // Caso permiso / licencia
            if (estado === 'permiso' || estado === 'licencia') {
                return {
                    horario_id: h.horario_id,
                    estado,
                    hora_llegada: undefined,
                    hora_salida_anticipada: undefined,
                    tiene_justificacion: !!motivo,
                    motivo,
                };
            }

            // Caso presente — simple
            return {
                horario_id: h.horario_id,
                estado: 'presente',
                hora_llegada: undefined,
                hora_salida_anticipada: undefined,
                tiene_justificacion: false,
            };
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ESCRITURA LEGACY — mantener para compatibilidad
    // ─────────────────────────────────────────────────────────────────────

    async registrarAsistencia(
        user: AuthUser,
        dto: RegistrarAsistenciaDocenteDto,
    ): Promise<{ id: string }> {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(dto.fecha);
        this.validateEstadoConsistencia(dto);

        const horario = await this.getHorarioConDocente(dto.horario_id);

        const sql = `
            INSERT INTO asistencias_docente
                (horario_id, docente_id, fecha, estado, hora_llegada,
                 hora_salida_anticipada, tiene_justificacion,
                 motivo_justificacion, hubo_reemplazo, observacion, registrado_por)
            VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9, $10, $11)
            ON CONFLICT (horario_id, fecha) DO UPDATE SET
                estado                 = EXCLUDED.estado,
                hora_llegada           = EXCLUDED.hora_llegada,
                hora_salida_anticipada = EXCLUDED.hora_salida_anticipada,
                tiene_justificacion    = EXCLUDED.tiene_justificacion,
                motivo_justificacion   = EXCLUDED.motivo_justificacion,
                hubo_reemplazo         = EXCLUDED.hubo_reemplazo,
                observacion            = EXCLUDED.observacion,
                registrado_por         = EXCLUDED.registrado_por,
                updated_at             = NOW()
            RETURNING id
        `;

        const rows = await this.ds.query(sql, [
            dto.horario_id,
            horario.docente_id,
            dto.fecha,
            dto.estado,
            dto.hora_llegada ?? null,
            (dto as any).hora_salida_anticipada ?? null,
            dto.tiene_justificacion ?? false,
            dto.motivo_justificacion ?? null,
            dto.hubo_reemplazo ?? false,
            dto.observacion ?? null,
            user.id,
        ]);

        return { id: rows[0].id };
    }

    async registrarAsistenciaBulk(
        user: AuthUser,
        dto: RegistrarAsistenciaDocenteBulkDto,
    ): Promise<{ insertados: number; actualizados: number; errores: any[] }> {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(dto.fecha);

        if (!dto.registros?.length) throw new BadRequestException('No se enviaron registros');
        if (dto.registros.length > 200) throw new BadRequestException('Máximo 200 registros');

        const errores: any[] = [];
        for (const r of dto.registros) {
            try { this.validateEstadoConsistencia(r); }
            catch (e: any) { errores.push({ horario_id: r.horario_id, error: e.message }); }
        }
        if (errores.length) throw new BadRequestException({ message: 'Errores de validación', errores });

        const horarioIds = dto.registros.map(r => r.horario_id);
        const horarios = await this.getHorariosConDocentes(horarioIds);
        const horarioMap = new Map(horarios.map(h => [h.id, h.docente_id]));

        const faltantes = horarioIds.filter(id => !horarioMap.has(id));
        if (faltantes.length) throw new NotFoundException(`Horarios no encontrados: ${faltantes.join(', ')}`);

        const qr = this.ds.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();

        try {
            let insertados = 0, actualizados = 0;

            for (const r of dto.registros) {
                const docenteId = horarioMap.get(r.horario_id)!;
                const sql = `
                    INSERT INTO asistencias_docente
                        (horario_id, docente_id, fecha, estado, hora_llegada,
                         hora_salida_anticipada, tiene_justificacion,
                         motivo_justificacion, hubo_reemplazo, observacion, registrado_por)
                    VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9, $10, $11)
                    ON CONFLICT (horario_id, fecha) DO UPDATE SET
                        estado                 = EXCLUDED.estado,
                        hora_llegada           = EXCLUDED.hora_llegada,
                        hora_salida_anticipada = EXCLUDED.hora_salida_anticipada,
                        tiene_justificacion    = EXCLUDED.tiene_justificacion,
                        motivo_justificacion   = EXCLUDED.motivo_justificacion,
                        hubo_reemplazo         = EXCLUDED.hubo_reemplazo,
                        observacion            = EXCLUDED.observacion,
                        registrado_por         = EXCLUDED.registrado_por,
                        updated_at             = NOW()
                    RETURNING (xmax = 0) AS was_inserted
                `;

                const [row] = await qr.query(sql, [
                    r.horario_id, docenteId, dto.fecha, r.estado,
                    r.hora_llegada ?? null,
                    (r as any).hora_salida_anticipada ?? null,
                    r.tiene_justificacion ?? false,
                    r.motivo_justificacion ?? null,
                    r.hubo_reemplazo ?? false,
                    r.observacion ?? null,
                    user.id,
                ]);

                if (row.was_inserted) insertados++; else actualizados++;
            }

            await qr.commitTransaction();
            return { insertados, actualizados, errores: [] };
        } catch (error) {
            await qr.rollbackTransaction();
            throw error;
        } finally {
            await qr.release();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // REPORTES
    // ─────────────────────────────────────────────────────────────────────

    async getReporteDiario(user: AuthUser, fecha: string): Promise<AsistenciaDocenteDiariaRow[]> {
        this.assertCanViewReports(user);
        return this.ds.query(SQL_REPORTE_DIARIO_DOCENTES, [fecha]);
    }

    async getResumenRango(
        user: AuthUser, fechaInicio: string, fechaFin: string,
    ): Promise<ResumenAsistenciaDocenteRow[]> {
        this.assertCanViewReports(user);
        this.assertRangoFechas(fechaInicio, fechaFin);
        return this.ds.query(SQL_RESUMEN_DOCENTES_RANGO, [fechaInicio, fechaFin]);
    }

    async getAlertas(
        user: AuthUser, fechaInicio: string, fechaFin: string, limit = 10,
    ): Promise<AlertaAusenciaDocenteRow[]> {
        this.assertCanViewReports(user);
        this.assertRangoFechas(fechaInicio, fechaFin);
        return this.ds.query(SQL_ALERTAS_AUSENCIAS_DOCENTE, [fechaInicio, fechaFin, limit]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────

    private async getHorariosParaDocentes(
        fecha: string,
        docenteIds: string[],
    ): Promise<Array<{ horario_id: string; docente_id: string; hora_inicio: string; hora_fin: string }>> {
        if (!docenteIds.length) return [];

        const diasMap: Record<number, string> = {
            1: 'lunes', 2: 'martes', 3: 'miercoles',
            4: 'jueves', 5: 'viernes',
        };
        const d = new Date(fecha + 'T12:00:00');
        const diaSemana = diasMap[d.getDay()];
        if (!diaSemana) return [];

        return this.ds.query(
            `SELECT
                h.id          AS horario_id,
                c.docente_id,
                h.hora_inicio::text AS hora_inicio,
                h.hora_fin::text    AS hora_fin
             FROM horarios h
             JOIN cursos c ON c.id = h.curso_id AND c.activo = true
             WHERE h.dia_semana = $1
               AND c.docente_id = ANY($2::uuid[])
               AND c.docente_id IS NOT NULL
             ORDER BY c.docente_id, h.hora_inicio`,
            [diaSemana, docenteIds],
        );
    }

    private assertCanRegister(user: AuthUser): void {
        if (user.rol !== 'auxiliar' && user.rol !== 'admin') {
            throw new ForbiddenException(
                'Solo auxiliares y administradores pueden registrar asistencia docente',
            );
        }
    }

    private assertCanViewReports(user: AuthUser): void {
        if (user.rol !== 'auxiliar' && user.rol !== 'admin') {
            throw new ForbiddenException('Acceso restringido a auxiliares y administradores');
        }
    }

    private assertFechaNoFutura(fecha: string): void {
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        if (new Date(fecha) > hoy) {
            throw new BadRequestException('No se puede registrar asistencia en fechas futuras');
        }
    }

    private assertRangoFechas(inicio: string, fin: string): void {
        if (new Date(inicio) > new Date(fin)) {
            throw new BadRequestException('fecha_inicio debe ser anterior o igual a fecha_fin');
        }
        const diffDias = (new Date(fin).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24);
        if (diffDias > 93) {
            throw new BadRequestException('El rango máximo permitido es 3 meses (93 días)');
        }
    }

    private validateEstadoConsistencia(dto: RegistrarAsistenciaDocenteDto): void {
        if (dto.hora_llegada && !['tardanza', 'presente', 'salida_anticipada'].includes(dto.estado)) {
            throw new BadRequestException('hora_llegada solo aplica en tardanza o salida_anticipada');
        }
        if (dto.tiene_justificacion && !dto.motivo_justificacion?.trim()) {
            throw new BadRequestException('motivo_justificacion es obligatorio cuando tiene_justificacion = true');
        }
    }

    private async getHorarioConDocente(horarioId: string) {
        const rows: Array<{ id: string; docente_id: string }> = await this.ds.query(
            `SELECT h.id, c.docente_id
             FROM horarios h
             JOIN cursos c ON c.id = h.curso_id
             WHERE h.id = $1 AND c.docente_id IS NOT NULL`,
            [horarioId],
        );
        if (!rows.length) throw new NotFoundException(`Horario ${horarioId} no encontrado o sin docente`);
        return rows[0];
    }

    private async getHorariosConDocentes(horarioIds: string[]) {
        if (!horarioIds.length) return [];
        return this.ds.query(
            `SELECT h.id, c.docente_id
             FROM horarios h
             JOIN cursos c ON c.id = h.curso_id
             WHERE h.id = ANY($1::uuid[]) AND c.docente_id IS NOT NULL`,
            [horarioIds],
        );
    }
}