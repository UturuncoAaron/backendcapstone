import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Schedule } from './entities/schedule.entity.js';
import { UpsertFranjaDto } from './dto/schedule.dto.js';

@Injectable()
export class ScheduleService {
    constructor(
        @InjectRepository(Schedule)
        private readonly scheduleRepo: Repository<Schedule>,
        private readonly db: DataSource,
    ) { }

    // ── GET schedule for a section ────────────────────────────────
    // seccionId / periodoId son UUID (no enteros). Antes el controller los
    // parseaba con ParseIntPipe y reventaba con 400 antes de llegar acá.
    async getHorarioBySeccion(seccionId: string, periodoId: string) {
        const courses = await this.db.query<{ id: string; nombre: string; color: string }[]>(
            `SELECT id, nombre, color
       FROM cursos
       WHERE seccion_id = $1 AND periodo_id = $2 AND activo = TRUE
       ORDER BY nombre`,
            [seccionId, periodoId],
        );
        if (!courses.length) return [];

        const courseIds = courses.map(c => c.id);
        const slots = await this.scheduleRepo.find({
            where: { curso_id: In(courseIds) },
            order: { dia_semana: 'ASC', hora_inicio: 'ASC' },
        });

        return courses.map(course => ({
            curso_id: course.id,
            curso_nombre: course.nombre,
            color: course.color,
            slots: slots
                .filter(s => s.curso_id === course.id)
                .map(s => ({
                    id: s.id,
                    dia_semana: s.dia_semana,
                    hora_inicio: s.hora_inicio.slice(0, 5),
                    hora_fin: s.hora_fin.slice(0, 5),
                    aula: s.aula,
                })),
        }));
    }

    // ── UPSERT slots for a course (replace all) ───────────────────
    async upsertFranjasCurso(cursoId: string, slots: UpsertFranjaDto[]) {
        const [course] = await this.db.query(
            `SELECT id, nombre FROM cursos WHERE id = $1 AND activo = TRUE`,
            [cursoId],
        );
        if (!course) throw new NotFoundException(`Curso ${cursoId} no encontrado`);

        this.validateOverlap(slots);

        await this.db.transaction(async manager => {
            await manager.delete(Schedule, { curso_id: cursoId });
            if (slots.length > 0) {
                const newSlots = slots.map(s =>
                    manager.create(Schedule, {
                        curso_id: cursoId,
                        dia_semana: s.dia_semana as any,
                        hora_inicio: s.hora_inicio,
                        hora_fin: s.hora_fin,
                        aula: s.aula?.trim() || null,
                    }),
                );
                await manager.save(Schedule, newSlots);
            }
        });

        return { course: course.nombre, slots_saved: slots.length };
    }

    // ── Horario para un alumno (secciones donde está matriculado en el periodo activo) ──
    async getHorarioForAlumno(alumnoId: string) {
        const periodoActivo = await this.db.query<{ id: string }[]>(
            `SELECT id FROM periodos WHERE activo = TRUE LIMIT 1`,
        );
        if (!periodoActivo.length) return [];

        const enrollment = await this.db.query<{ seccion_id: string }[]>(
            `SELECT seccion_id FROM matriculas
             WHERE alumno_id = $1 AND periodo_id = $2 AND activo = TRUE
             LIMIT 1`,
            [alumnoId, periodoActivo[0].id],
        );
        if (!enrollment.length) return [];

        return this.getHorarioBySeccion(enrollment[0].seccion_id, periodoActivo[0].id);
    }

    // ── Verificación de vínculo padre-alumno ──────────────────────
    async isPadreDeAlumno(padreId: string, alumnoId: string): Promise<boolean> {
        const rows = await this.db.query(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2 LIMIT 1`,
            [padreId, alumnoId],
        );
        return rows.length > 0;
    }

    // ── DELETE single slot ────────────────────────────────────────
    async deleteFranja(slotId: number) {
        const slot = await this.scheduleRepo.findOne({ where: { id: slotId } });
        if (!slot) throw new NotFoundException(`Slot ${slotId} no encontrado`);
        await this.scheduleRepo.remove(slot);
        return { deleted: slotId };
    }

    // ── Overlap validation ────────────────────────────────────────
    private validateOverlap(slots: UpsertFranjaDto[]) {
        const byDay = new Map<string, { start: string; end: string }[]>();

        for (const s of slots) {
            if (s.hora_inicio >= s.hora_fin) {
                throw new BadRequestException(
                    `hora_fin debe ser mayor a hora_inicio en la franja del ${s.dia_semana}`,
                );
            }
            const list = byDay.get(s.dia_semana) ?? [];
            for (const existing of list) {
                if (s.hora_inicio < existing.end && s.hora_fin > existing.start) {
                    throw new BadRequestException(
                        `Solapamiento de horario el ${s.dia_semana} entre ${s.hora_inicio}-${s.hora_fin}`,
                    );
                }
            }
            list.push({ start: s.hora_inicio, end: s.hora_fin });
            byDay.set(s.dia_semana, list);
        }
    }
}
