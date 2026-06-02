import { Injectable, ForbiddenException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/types/auth-user.js';
import { SQL_DOCENTES_DEL_DIA } from '../reports/queries/reports.queries.js';
import type { RegistrarAsistenciaDocenteBulkDiaDto, MarcarSalidaDocenteDto } from './dto/asistencia.dto.js';

@Injectable()
export class DocenteAttendanceService {
    private readonly logger = new Logger(DocenteAttendanceService.name);

    constructor(@InjectDataSource() private readonly ds: DataSource) { }

    async getDocentesDelDia(user: AuthUser, fecha: string) {
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

    async registrarBulk(user: AuthUser, dto: RegistrarAsistenciaDocenteBulkDiaDto) {
        this.assertCanRegister(user);
        this.assertFechaNoFutura(dto.fecha);

        if (!dto.docentes?.length) {
            throw new BadRequestException('No se enviaron docentes');
        }

        const diasMap: Record<number, string> = {
            1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes',
        };
        const diaSemana = diasMap[new Date(dto.fecha + 'T12:00:00').getDay()];
        if (!diaSemana) {
            throw new BadRequestException('No se registra asistencia en fines de semana');
        }

        const docenteIds = dto.docentes.map(d => d.docente_id);

        // Obtenemos todos los horarios de los docentes implicados para clonar los estados a nivel de bloque
        const horarios = await this.ds.query(
            `SELECT h.id AS horario_id, c.docente_id, h.hora_inicio::text
             FROM horarios h
             JOIN cursos c ON c.id = h.curso_id AND c.activo = true
             WHERE h.dia_semana = $1
               AND c.docente_id = ANY($2::uuid[])
             ORDER BY c.docente_id, h.hora_inicio`,
            [diaSemana, docenteIds],
        );

        const horariosPorDocente = new Map<string, { horario_id: string; hora_inicio: string }[]>();
        for (const h of horarios) {
            if (!horariosPorDocente.has(h.docente_id)) {
                horariosPorDocente.set(h.docente_id, []);
            }
            horariosPorDocente.get(h.docente_id)!.push(h);
        }

        const qr = this.ds.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();

        let jornadasRegistradas = 0;
        const errores: any[] = [];

        try {
            for (const docente of dto.docentes) {
                const bloques = horariosPorDocente.get(docente.docente_id) ?? [];

                if (!bloques.length) {
                    errores.push({
                        docente_id: docente.docente_id,
                        error: 'No tiene horarios programados para este día',
                    });
                    continue;
                }

                // 1. Insertar o actualizar la verdad única: La Jornada Diaria del Empleado
                const resJornada = await qr.query(
                    `INSERT INTO asistencias_jornada_docente
                        (docente_id, fecha, estado_jornada, hora_llegada, motivo_justificacion, registrado_por)
                     VALUES ($1, $2, $3, $4::time, $5, $6)
                     ON CONFLICT (docente_id, fecha) DO UPDATE SET
                        estado_jornada       = EXCLUDED.estado_jornada,
                        hora_llegada         = EXCLUDED.hora_llegada,
                        motivo_justificacion = EXCLUDED.motivo_justificacion,
                        registrado_por       = EXCLUDED.registrado_por,
                        updated_at           = NOW()
                     RETURNING id`,
                    [
                        docente.docente_id,
                        dto.fecha,
                        docente.estado,
                        docente.hora_llegada ?? null,
                        docente.motivo_justificacion ?? null,
                        user.id,
                    ],
                );

                const jornadaId = resJornada[0].id;

                // 2. Propagar de manera uniforme a cada bloque de clase mapeando la jerarquía
                for (const bloque of bloques) {
                    await qr.query(
                        `INSERT INTO asistencias_docente
                            (horario_id, docente_id, fecha, estado, hora_llegada,
                             motivo_justificacion, hubo_reemplazo, observacion, registrado_por, jornada_id)
                         VALUES ($1, $2, $3, $4, $5::time, $6, $7, $8, $9, $10)
                         ON CONFLICT (horario_id, fecha) DO UPDATE SET
                             estado               = EXCLUDED.estado,
                             hora_llegada         = EXCLUDED.hora_llegada,
                             motivo_justificacion = EXCLUDED.motivo_justificacion,
                             hubo_reemplazo       = EXCLUDED.hubo_reemplazo,
                             observacion          = EXCLUDED.observacion,
                             registrado_por       = EXCLUDED.registrado_por,
                             jornada_id           = EXCLUDED.jornada_id,
                             updated_at           = NOW()`,
                        [
                            bloque.horario_id,
                            docente.docente_id,
                            dto.fecha,
                            docente.estado,
                            docente.hora_llegada ?? null,
                            docente.motivo_justificacion ?? null,
                            docente.hubo_reemplazo ?? false,
                            docente.observacion ?? null,
                            user.id,
                            jornadaId,
                        ],
                    );
                }
                jornadasRegistradas++;
            }

            await qr.commitTransaction();
            this.logger.log(`Jornadas docentes procesadas bulk: ${jornadasRegistradas} | ${dto.fecha}`);
            return {
                procesados: dto.docentes.length - errores.length,
                jornadas_registradas: jornadasRegistradas,
                errores,
            };
        } catch (error) {
            await qr.rollbackTransaction();
            throw error;
        } finally {
            await qr.release();
        }
    }

    async marcarSalida(user: AuthUser, dto: MarcarSalidaDocenteDto) {
        this.assertCanRegister(user);

        const rows = await this.ds.query(
            `SELECT id, docente_id, estado FROM asistencias_docente
             WHERE horario_id = $1 AND fecha = $2::date
             LIMIT 1`,
            [dto.horario_id, dto.fecha],
        );

        if (!rows.length) {
            throw new NotFoundException(
                `No existe registro de asistencia para este horario en la fecha ${dto.fecha}`,
            );
        }

        const registro = rows[0] as { id: string; docente_id: string; estado: string };

        if (!['presente', 'tardanza'].includes(registro.estado)) {
            throw new BadRequestException(
                `Solo se puede marcar salida cuando el estado es presente o tardanza (estado actual: ${registro.estado})`,
            );
        }

        // Marcamos la salida en el bloque horario específico de la clase
        await this.ds.query(
            `UPDATE asistencias_docente
             SET hora_salida = $1::time, updated_at = NOW()
             WHERE id = $2`,
            [dto.hora_salida, registro.id],
        );

        // Actualizamos también la jornada laboral general del docente con su último registro de salida
        await this.ds.query(
            `UPDATE asistencias_jornada_docente
             SET hora_salida = $1::time, updated_at = NOW()
             WHERE docente_id = $2 AND fecha = $3::date`,
            [dto.hora_salida, registro.docente_id, dto.fecha],
        );

        this.logger.verbose(`Salida unificada guardada: horario ${dto.horario_id} | ${dto.fecha} | ${dto.hora_salida}`);
        return { ok: true, hora_salida: dto.hora_salida };
    }

    private assertCanRegister(user: AuthUser): void {
        if (user.rol !== 'auxiliar' && user.rol !== 'admin') {
            throw new ForbiddenException('Solo auxiliares y administradores pueden registrar asistencia docente');
        }
    }

    private assertFechaNoFutura(fecha: string): void {
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        if (new Date(fecha + 'T12:00:00') > hoy) {
            throw new BadRequestException('No se puede registrar asistencia en fechas futuras');
        }
    }
}