import {
    Injectable,
    ForbiddenException,
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
    RegistrarAsistenciaDocenteDto,
    RegistrarAsistenciaDocenteBulkDto,
} from '../dto/teacher-attendance.dto.js';
import {
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
} from '../types/reports.types.js';

/**
 * TeacherAttendanceService
 *
 * Gestiona el registro y consulta de asistencia de docentes.
 * Solo auxiliares y admins pueden REGISTRAR.
 * Solo admins y auxiliares pueden CONSULTAR reportes.
 *
 * Modelo de datos:
 *   - El horario define qué docente, en qué aula, a qué hora.
 *   - La tabla asistencias_docente registra el estado REAL en una fecha.
 *   - La UNIQUE (horario_id, fecha) garantiza un solo registro por bloque/día.
 *
 * Registro masivo (bulk):
 *   - Se usa una transacción con INSERT ... ON CONFLICT DO UPDATE (upsert).
 *   - Si el auxiliar ya registró y vuelve a enviar, se actualiza el registro.
 *   - Esto permite corregir errores durante el mismo día sin fricción.
 */
@Injectable()
export class TeacherAttendanceService {
    constructor(@InjectDataSource() private readonly ds: DataSource) { }

    // ─────────────────────────────────────────────────────────────────────
    // LECTURA — para el auxiliar antes de registrar
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Devuelve todos los bloques de horario del día con su estado actual
     * (si ya fue registrado) o 'sin-registro'. El auxiliar usa esto para
     * saber qué bloques faltan completar.
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
    // ESCRITURA — registro individual y masivo
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Registra o actualiza la asistencia de un bloque de horario.
     * Usa UPSERT para permitir correcciones sin error.
     */
    async registrarAsistencia(
        user: AuthUser,
        dto: RegistrarAsistenciaDocenteDto,
    ): Promise<{ id: string }> {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(dto.fecha);
        this.validateEstadoConsistencia(dto);

        // Verificar que el horario existe y obtener docente_id
        const horario = await this.getHorarioConDocente(dto.horario_id);

        const sql = `
      INSERT INTO asistencias_docente
        (horario_id, docente_id, fecha, estado, hora_llegada,
         tiene_justificacion, motivo_justificacion, hubo_reemplazo,
         observacion, registrado_por)
      VALUES ($1, $2, $3, $4, $5::time, $6, $7, $8, $9, $10)
      ON CONFLICT (horario_id, fecha) DO UPDATE SET
        estado               = EXCLUDED.estado,
        hora_llegada         = EXCLUDED.hora_llegada,
        tiene_justificacion  = EXCLUDED.tiene_justificacion,
        motivo_justificacion = EXCLUDED.motivo_justificacion,
        hubo_reemplazo       = EXCLUDED.hubo_reemplazo,
        observacion          = EXCLUDED.observacion,
        registrado_por       = EXCLUDED.registrado_por,
        updated_at           = NOW()
      RETURNING id
    `;

        const rows = await this.ds.query(sql, [
            dto.horario_id,
            horario.docente_id,
            dto.fecha,
            dto.estado,
            dto.hora_llegada ?? null,
            dto.tiene_justificacion ?? false,
            dto.motivo_justificacion ?? null,
            dto.hubo_reemplazo ?? false,
            dto.observacion ?? null,
            user.id,
        ]);

        return { id: rows[0].id };
    }

    /**
     * Registro masivo: el auxiliar envía todos los bloques del día de una vez.
     * Se ejecuta en una única transacción — si uno falla, todos se revierten.
     *
     * Retorna un resumen: cuántos se insertaron, cuántos se actualizaron,
     * cuántos fallaron (con detalle de error por horario_id).
     */
    async registrarAsistenciaBulk(
        user: AuthUser,
        dto: RegistrarAsistenciaDocenteBulkDto,
    ): Promise<BulkResult> {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(dto.fecha);

        if (!dto.registros || dto.registros.length === 0) {
            throw new BadRequestException('No se enviaron registros');
        }

        if (dto.registros.length > 200) {
            throw new BadRequestException(
                'Máximo 200 registros por operación bulk',
            );
        }

        // Validar consistencia de cada registro antes de abrir transacción
        const errores: BulkError[] = [];
        for (const r of dto.registros) {
            try {
                this.validateEstadoConsistencia(r);
            } catch (e: any) {
                errores.push({
                    horario_id: r.horario_id,
                    error: e.message,
                });
            }
        }
        if (errores.length > 0) {
            throw new BadRequestException({ message: 'Errores de validación', errores });
        }

        // Obtener docente_id para cada horario en una sola query
        const horarioIds = dto.registros.map((r) => r.horario_id);
        const horarios = await this.getHorariosConDocentes(horarioIds);
        const horarioMap = new Map(horarios.map((h) => [h.id, h.docente_id]));

        // Verificar que todos los horarios existen
        const faltantes = horarioIds.filter((id) => !horarioMap.has(id));
        if (faltantes.length > 0) {
            throw new NotFoundException(`Horarios no encontrados: ${faltantes.join(', ')}`);
        }

        // Ejecutar todo en una transacción
        const queryRunner = this.ds.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            let insertados = 0;
            let actualizados = 0;

            for (const r of dto.registros) {
                const docenteId = horarioMap.get(r.horario_id)!;

                const sql = `
          INSERT INTO asistencias_docente
            (horario_id, docente_id, fecha, estado, hora_llegada,
             tiene_justificacion, motivo_justificacion, hubo_reemplazo,
             observacion, registrado_por)
          VALUES ($1, $2, $3, $4, $5::time, $6, $7, $8, $9, $10)
          ON CONFLICT (horario_id, fecha) DO UPDATE SET
            estado               = EXCLUDED.estado,
            hora_llegada         = EXCLUDED.hora_llegada,
            tiene_justificacion  = EXCLUDED.tiene_justificacion,
            motivo_justificacion = EXCLUDED.motivo_justificacion,
            hubo_reemplazo       = EXCLUDED.hubo_reemplazo,
            observacion          = EXCLUDED.observacion,
            registrado_por       = EXCLUDED.registrado_por,
            updated_at           = NOW()
          RETURNING (xmax = 0) AS was_inserted
        `;

                const [row] = await queryRunner.query(sql, [
                    r.horario_id,
                    docenteId,
                    dto.fecha,
                    r.estado,
                    r.hora_llegada ?? null,
                    r.tiene_justificacion ?? false,
                    r.motivo_justificacion ?? null,
                    r.hubo_reemplazo ?? false,
                    r.observacion ?? null,
                    user.id,
                ]);

                if (row.was_inserted) insertados++;
                else actualizados++;
            }

            await queryRunner.commitTransaction();
            return { insertados, actualizados, errores: [] };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // REPORTES
    // ─────────────────────────────────────────────────────────────────────

    /** Reporte diario: todos los bloques del día con estado de cada docente */
    async getReporteDiario(
        user: AuthUser,
        fecha: string,
    ): Promise<AsistenciaDocenteDiariaRow[]> {
        this.assertCanViewReports(user);
        return this.ds.query(SQL_REPORTE_DIARIO_DOCENTES, [fecha]);
    }

    /** Resumen en rango de fechas: % asistencia, ausencias, etc. por docente */
    async getResumenRango(
        user: AuthUser,
        fechaInicio: string,
        fechaFin: string,
    ): Promise<ResumenAsistenciaDocenteRow[]> {
        this.assertCanViewReports(user);
        this.assertRangoFechas(fechaInicio, fechaFin);
        return this.ds.query(SQL_RESUMEN_DOCENTES_RANGO, [fechaInicio, fechaFin]);
    }

    /** Alertas: docentes con más ausencias sin justificación */
    async getAlertas(
        user: AuthUser,
        fechaInicio: string,
        fechaFin: string,
        limit = 10,
    ): Promise<AlertaAusenciaDocenteRow[]> {
        this.assertCanViewReports(user);
        this.assertRangoFechas(fechaInicio, fechaFin);
        return this.ds.query(SQL_ALERTAS_AUSENCIAS_DOCENTE, [
            fechaInicio,
            fechaFin,
            limit,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────

    private assertCanRegister(user: AuthUser): void {
        if (user.rol !== 'auxiliar' && user.rol !== 'admin') {
            throw new ForbiddenException(
                'Solo auxiliares y administradores pueden registrar asistencia docente',
            );
        }
    }

    private assertCanViewReports(user: AuthUser): void {
        if (user.rol !== 'auxiliar' && user.rol !== 'admin') {
            throw new ForbiddenException(
                'Acceso restringido a auxiliares y administradores',
            );
        }
    }

    private assertFechaNoFutura(fecha: string): void {
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999); // fin del día de hoy
        const fechaDate = new Date(fecha);
        if (fechaDate > hoy) {
            throw new BadRequestException(
                'No se puede registrar asistencia en fechas futuras',
            );
        }
    }

    private assertRangoFechas(inicio: string, fin: string): void {
        if (new Date(inicio) > new Date(fin)) {
            throw new BadRequestException(
                'fecha_inicio debe ser anterior o igual a fecha_fin',
            );
        }
        // Máximo 3 meses para evitar queries muy costosas
        const diffMs = new Date(fin).getTime() - new Date(inicio).getTime();
        const diffDias = diffMs / (1000 * 60 * 60 * 24);
        if (diffDias > 93) {
            throw new BadRequestException(
                'El rango máximo permitido es 3 meses (93 días)',
            );
        }
    }

    private validateEstadoConsistencia(dto: RegistrarAsistenciaDocenteDto): void {
        // hora_llegada solo aplica en tardanza
        if (dto.hora_llegada && dto.estado !== 'tardanza') {
            throw new BadRequestException(
                'hora_llegada solo aplica cuando estado = "tardanza"',
            );
        }
        // tardanza sin hora_llegada es válido pero emitir warning no es rol del backend
        // motivo_justificacion obligatorio si tiene_justificacion = true
        if (dto.tiene_justificacion && !dto.motivo_justificacion?.trim()) {
            throw new BadRequestException(
                'motivo_justificacion es obligatorio cuando tiene_justificacion = true',
            );
        }
    }

    private async getHorarioConDocente(
        horarioId: string,
    ): Promise<{ id: string; docente_id: string }> {
        const rows: Array<{ id: string; docente_id: string }> =
            await this.ds.query(
                `SELECT h.id, c.docente_id
         FROM horarios h
         JOIN cursos c ON c.id = h.curso_id
         WHERE h.id = $1 AND c.docente_id IS NOT NULL`,
                [horarioId],
            );

        if (rows.length === 0) {
            throw new NotFoundException(
                `Horario ${horarioId} no encontrado o sin docente asignado`,
            );
        }
        return rows[0];
    }

    private async getHorariosConDocentes(
        horarioIds: string[],
    ): Promise<Array<{ id: string; docente_id: string }>> {
        if (horarioIds.length === 0) return [];
        // Usamos ANY para pasar el array de UUIDs de una sola vez
        return this.ds.query(
            `SELECT h.id, c.docente_id
       FROM horarios h
       JOIN cursos c ON c.id = h.curso_id
       WHERE h.id = ANY($1::uuid[])
         AND c.docente_id IS NOT NULL`,
            [horarioIds],
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos locales del servicio
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkError {
    horario_id: string;
    error: string;
}

export interface BulkResult {
    insertados: number;
    actualizados: number;
    errores: BulkError[];
}