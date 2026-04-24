import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LiveClass, EstadoClase } from './entities/live-class.entity.js';
import { Attendance } from './entities/attendance.entity.js';

@Injectable()
export class LiveClassesService {
    private readonly logger = new Logger(LiveClassesService.name);

    constructor(
        @InjectRepository(LiveClass)
        private readonly liveClassRepo: Repository<LiveClass>,
        @InjectRepository(Attendance)
        private readonly attendanceRepo: Repository<Attendance>,
    ) { }

    // ── CLASES EN VIVO ──────────────────────────────────────────

    async findByCourse(cursoId: string) {
        return this.liveClassRepo.find({
            where: { curso_id: cursoId },
            order: { fecha_hora: 'DESC' },
        });
    }

    async findOne(id: string) {
        const clase = await this.liveClassRepo.findOne({
            where: { id },
            relations: ['curso'],
        });
        if (!clase) throw new NotFoundException(`Clase ${id} no encontrada`);
        return clase;
    }

    async create(dto: {
        curso_id: string;
        titulo: string;
        descripcion?: string;
        fecha_hora: Date;
        duracion_min?: number;
        link_reunion: string;
    }) {
        const clase = this.liveClassRepo.create({
            ...dto,
            descripcion: dto.descripcion ?? null,
            duracion_min: dto.duracion_min ?? 60,
            estado: 'programada',
        });
        this.logger.log(`Clase creada: ${dto.titulo}`);
        return this.liveClassRepo.save(clase);
    }

    async updateEstado(id: string, estado: EstadoClase, userId: string, rol: string) {
        const clase = await this.findOne(id);

        if (rol === 'docente' && clase.curso.docente_id !== userId) {
            throw new ForbiddenException('No tienes permiso para modificar esta clase');
        }

        clase.estado = estado;
        this.logger.log(`Clase ${id} → estado: ${estado}`);
        return this.liveClassRepo.save(clase);
    }

    async update(id: string, dto: Partial<{
        titulo: string;
        descripcion: string;
        fecha_hora: Date;
        duracion_min: number;
        link_reunion: string;
    }>, userId: string, rol: string) {
        const clase = await this.findOne(id);

        if (rol === 'docente' && clase.curso.docente_id !== userId) {
            throw new ForbiddenException('No tienes permiso para modificar esta clase');
        }

        Object.assign(clase, dto);
        return this.liveClassRepo.save(clase);
    }

    async remove(id: string, userId: string, rol: string) {
        const clase = await this.findOne(id);

        if (rol === 'docente' && clase.curso.docente_id !== userId) {
            throw new ForbiddenException('No tienes permiso para eliminar esta clase');
        }

        await this.liveClassRepo.remove(clase);
        return { message: 'Clase eliminada correctamente' };
    }

    // ── ASISTENCIAS ─────────────────────────────────────────────

    async getAttendance(claseId: string) {
        return this.attendanceRepo.find({
            where: { clase_vivo_id: claseId },
            relations: ['alumno'],
            order: { created_at: 'ASC' },
        });
    }

    async registerAttendance(dto: {
        clase_vivo_id: string;
        alumno_id: string;
        presente: boolean;
        justificacion?: string;
        registrado_por: string;
    }) {
        // Upsert: si ya existe actualiza, si no crea
        const existing = await this.attendanceRepo.findOne({
            where: {
                clase_vivo_id: dto.clase_vivo_id,
                alumno_id: dto.alumno_id,
            },
        });

        if (existing) {
            existing.presente = dto.presente;
            existing.justificacion = dto.justificacion ?? null;
            existing.registrado_por = dto.registrado_por;
            return this.attendanceRepo.save(existing);
        }

        const attendance = this.attendanceRepo.create({
            clase_vivo_id: dto.clase_vivo_id,
            alumno_id: dto.alumno_id,
            presente: dto.presente,
            justificacion: dto.justificacion ?? null,
            registrado_por: dto.registrado_por,
        });
        return this.attendanceRepo.save(attendance);
    }

    async registerBulkAttendance(dto: {
        clase_vivo_id: string;
        registrado_por: string;
        alumnos: { alumno_id: string; presente: boolean; justificacion?: string }[];
    }) {
        const results = await Promise.all(
            dto.alumnos.map(a => this.registerAttendance({
                clase_vivo_id: dto.clase_vivo_id,
                alumno_id: a.alumno_id,
                presente: a.presente,
                justificacion: a.justificacion,
                registrado_por: dto.registrado_por,
            }))
        );
        this.logger.log(`Asistencia registrada: ${results.length} alumnos en clase ${dto.clase_vivo_id}`);
        return { registrados: results.length, asistencias: results };
    }

    async getAttendanceByAlumno(alumnoId: string, cursoId?: string) {
        const query = this.attendanceRepo.createQueryBuilder('a')
            .leftJoinAndSelect('a.clase_vivo', 'c')
            
            .where('a.alumno_id = :alumnoId', { alumnoId });

        if (cursoId) {
            query.andWhere('c.curso_id = :cursoId', { cursoId });
        }

        return query.orderBy('c.fecha_hora', 'DESC').getMany();
    }
}
