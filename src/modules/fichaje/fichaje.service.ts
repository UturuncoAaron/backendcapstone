import {
    Injectable, UnauthorizedException,
    BadRequestException, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { AsistenciaPersonal } from './entities/asistencia-personal.entity.js';
import { HorarioLaboral } from './entities/horario-laboral.entity.js';
import { UsersService } from '../users/users.service.js';
import {
    FichajeDto, EditarAsistenciaPersonalDto,
    QueryAsistenciaPersonalDto, HorarioLaboralDto,
} from './dto/fichaje.dto.js';

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

@Injectable()
export class FichajeService {
    private readonly logger = new Logger(FichajeService.name);

    constructor(
        @InjectRepository(AsistenciaPersonal)
        private readonly asistRepo: Repository<AsistenciaPersonal>,
        @InjectRepository(HorarioLaboral)
        private readonly horarioRepo: Repository<HorarioLaboral>,
        private readonly usersService: UsersService,
        private readonly dataSource: DataSource,
    ) { }

    async fichar(dto: FichajeDto) {
        const input = dto.codigo_acceso.trim().toUpperCase();

        let cuenta = await this.usersService.findCuentaByCodigoAcceso(input);
        if (!cuenta) {
            cuenta = await this.usersService.findCuentaByNumeroDocumento(dto.codigo_acceso.trim());
        }

        if (!cuenta || !cuenta.activo) {
            throw new UnauthorizedException('Credenciales incorrectas o cuenta inactiva');
        }

        if (cuenta.rol === 'alumno' || cuenta.rol === 'padre') {
            throw new UnauthorizedException('Este acceso es solo para personal del colegio');
        }

        const passwordOk = await bcrypt.compare(dto.password, cuenta.password_hash);
        if (!passwordOk) {
            throw new UnauthorizedException('Credenciales incorrectas o cuenta inactiva');
        }

        const ahora = new Date();
        const horaActual = this.toTimeString(ahora);
        const fechaHoy = this.toDateString(ahora);
        const diaSemana = DIAS_SEMANA[ahora.getDay()];

        const registroHoy = await this.asistRepo.findOne({
            where: { cuenta_id: cuenta.id, fecha: fechaHoy },
        });

        // Si ya existe registro del día → marcar salida
        if (registroHoy) {
            if (registroHoy.hora_salida) {
                return {
                    accion: 'ya_completo',
                    mensaje: 'Ya registraste entrada y salida el día de hoy',
                    nombre: await this.getNombre(cuenta.id, cuenta.rol),
                    hora_entrada: registroHoy.hora_entrada,
                    hora_salida: registroHoy.hora_salida,
                };
            }

            await this.asistRepo.update(registroHoy.id, {
                hora_salida: horaActual,
                registrado_por: cuenta.id,
            });

            this.logger.verbose(`Salida: ${cuenta.codigo_acceso} a las ${horaActual}`);

            return {
                accion: 'salida',
                mensaje: 'Salida registrada correctamente',
                nombre: await this.getNombre(cuenta.id, cuenta.rol),
                hora: horaActual,
            };
        }

        // No hay registro → marcar entrada
        const { horaEsperada, horaSalidaEsperada } = await this.resolverHorarioEsperado(
            cuenta.id, cuenta.rol, diaSemana,
        );

        const estado = this.calcularEstado(horaActual, horaEsperada);

        const nuevo = this.asistRepo.create({
            cuenta_id: cuenta.id,
            fecha: fechaHoy,
            estado,
            hora_entrada: horaActual,
            hora_entrada_esperada: horaEsperada,
            hora_salida_esperada: horaSalidaEsperada,
            registrado_por: cuenta.id,
        });

        await this.asistRepo.save(nuevo);

        this.logger.verbose(`Entrada: ${cuenta.codigo_acceso} estado=${estado} a las ${horaActual}`);

        return {
            accion: 'entrada',
            mensaje: estado === 'tardanza' ? 'Entrada registrada con tardanza' : 'Entrada registrada correctamente',
            nombre: await this.getNombre(cuenta.id, cuenta.rol),
            estado,
            hora: horaActual,
            hora_esperada: horaEsperada,
        };
    }

    private async resolverHorarioEsperado(
        cuentaId: string,
        rol: string,
        diaSemana: string,
    ): Promise<{ horaEsperada: string | null; horaSalidaEsperada: string | null }> {

        if (rol === 'docente') {
            // Para docentes: primer y último horario de curso del día
            const hoy = DIAS_SEMANA.indexOf(diaSemana);
            if (hoy < 0) return { horaEsperada: null, horaSalidaEsperada: null };

            const horarios = await this.dataSource.query<{ hora_inicio: string; hora_fin: string }[]>(
                `SELECT h.hora_inicio, h.hora_fin
                   FROM horarios h
                   JOIN cursos c ON c.id = h.curso_id AND c.activo = TRUE
                  WHERE c.docente_id = $1
                    AND h.dia_semana = $2
                  ORDER BY h.hora_inicio ASC`,
                [cuentaId, diaSemana],
            );

            if (!horarios.length) return { horaEsperada: null, horaSalidaEsperada: null };

            return {
                horaEsperada: horarios[0].hora_inicio,
                horaSalidaEsperada: horarios[horarios.length - 1].hora_fin,
            };
        }

        // Para todos los demás: buscar en horarios_laborales
        const horario = await this.horarioRepo.findOne({
            where: { cuenta_id: cuentaId, dia_semana: diaSemana, activo: true },
        });

        return {
            horaEsperada: horario?.hora_inicio ?? null,
            horaSalidaEsperada: horario?.hora_fin ?? null,
        };
    }

    private calcularEstado(horaActual: string, horaEsperada: string | null): 'presente' | 'tardanza' {
        if (!horaEsperada) return 'presente';
        return horaActual <= horaEsperada ? 'presente' : 'tardanza';
    }

    private toTimeString(date: Date): string {
        return date.toTimeString().slice(0, 8);
    }

    private toDateString(date: Date): string {
        return date.toLocaleDateString('en-CA');
    }

    private async getNombre(id: string, rol: string): Promise<string> {
        const perfil = await this.usersService.getNombreById(id, rol);
        if (!perfil) return 'Usuario';
        return `${perfil.nombre} ${perfil.apellido_paterno}`;
    }

    // ── Admin: listar asistencias ─────────────────────────────────────────

    async findAll(query: QueryAsistenciaPersonalDto) {
        const page = Math.max(1, parseInt(query.page ?? '1'));
        const limit = Math.min(100, parseInt(query.limit ?? '20'));
        const offset = (page - 1) * limit;

        const qb = this.dataSource.createQueryBuilder()
            .select([
                'ap.id            AS id',
                'ap.cuenta_id     AS cuenta_id',
                'ap.fecha         AS fecha',
                'ap.estado        AS estado',
                'ap.hora_entrada  AS hora_entrada',
                'ap.hora_salida   AS hora_salida',
                'ap.hora_entrada_esperada AS hora_entrada_esperada',
                'ap.hora_salida_esperada  AS hora_salida_esperada',
                'ap.motivo_justificacion  AS motivo_justificacion',
                'ap.observacion   AS observacion',
                'ap.editado_por   AS editado_por',
                'ap.editado_at    AS editado_at',
                'c.rol            AS rol',
                'c.codigo_acceso  AS codigo_acceso',
                `COALESCE(
                    (SELECT d.nombre || ' ' || d.apellido_paterno FROM docentes d WHERE d.id = ap.cuenta_id),
                    (SELECT a.nombre || ' ' || a.apellido_paterno FROM admins a WHERE a.id = ap.cuenta_id),
                    (SELECT p.nombre || ' ' || p.apellido_paterno FROM psicologas p WHERE p.id = ap.cuenta_id),
                    (SELECT s.nombre || ' ' || s.apellido_paterno FROM staff s WHERE s.id = ap.cuenta_id)
                ) AS nombre_completo`,
            ])
            .from('asistencias_personal', 'ap')
            .innerJoin('cuentas', 'c', 'c.id = ap.cuenta_id');

        if (query.fecha) qb.andWhere('ap.fecha = :fecha', { fecha: query.fecha });
        if (query.cuenta_id) qb.andWhere('ap.cuenta_id = :cuentaId', { cuentaId: query.cuenta_id });
        if (query.estado) qb.andWhere('ap.estado = :estado', { estado: query.estado });

        qb.orderBy('ap.fecha', 'DESC').addOrderBy('ap.hora_entrada', 'ASC');

        const total = await qb.getCount();
        const rows = await qb.limit(limit).offset(offset).getRawMany();

        return {
            data: rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async editarAsistencia(
        id: string,
        dto: EditarAsistenciaPersonalDto,
        adminId: string,
    ) {
        const registro = await this.asistRepo.findOne({ where: { id } });
        if (!registro) throw new NotFoundException(`Registro ${id} no encontrado`);

        if (dto.estado === 'justificado' && !dto.motivo_justificacion?.trim()) {
            throw new BadRequestException('El estado justificado requiere un motivo');
        }

        await this.asistRepo.update(id, {
            estado: dto.estado as any,
            hora_entrada: dto.hora_entrada ?? registro.hora_entrada,
            hora_salida: dto.hora_salida ?? registro.hora_salida,
            motivo_justificacion: dto.motivo_justificacion ?? registro.motivo_justificacion,
            observacion: dto.observacion ?? registro.observacion,
            editado_por: adminId,
            editado_at: new Date(),
        });

        return { message: 'Asistencia actualizada correctamente' };
    }

    // ── Horarios laborales ────────────────────────────────────────────────

    async getHorariosLaborales(cuentaId: string) {
        return this.horarioRepo.find({
            where: { cuenta_id: cuentaId, activo: true },
            order: { dia_semana: 'ASC' },
        });
    }

    async upsertHorarioLaboral(cuentaId: string, dto: HorarioLaboralDto) {
        const existing = await this.horarioRepo.findOne({
            where: { cuenta_id: cuentaId, dia_semana: dto.dia_semana },
        });

        if (existing) {
            await this.horarioRepo.update(existing.id, {
                hora_inicio: dto.hora_inicio,
                hora_fin: dto.hora_fin,
                activo: true,
            });
            return { message: 'Horario actualizado' };
        }

        await this.horarioRepo.save(
            this.horarioRepo.create({
                cuenta_id: cuentaId,
                dia_semana: dto.dia_semana,
                hora_inicio: dto.hora_inicio,
                hora_fin: dto.hora_fin,
            }),
        );

        return { message: 'Horario creado' };
    }

    async deleteHorarioLaboral(cuentaId: string, dia: string) {
        const existing = await this.horarioRepo.findOne({
            where: { cuenta_id: cuentaId, dia_semana: dia },
        });
        if (!existing) throw new NotFoundException('Horario no encontrado');
        await this.horarioRepo.update(existing.id, { activo: false });
        return { message: 'Horario eliminado' };
    }
}