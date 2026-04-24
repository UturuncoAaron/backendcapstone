import {
    Injectable, NotFoundException,
    BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { Task } from './entities/task.entity.js';
import { Submission } from './entities/submission.entity.js';
import { Pregunta } from './entities/pregunta.entity.js';
import { Opcion } from './entities/opcion.entity.js';
import { RespuestaAlternativa } from './entities/respuesta-alternativa.entity.js';

import {
    CreateTaskDto, SubmitTaskDto,
    SubmitAlternativasDto, GradeTaskDto, ToggleTaskDto,
} from './dto/tasks.dto.js';

@Injectable()
export class TasksService {
    constructor(
        @InjectRepository(Task) private taskRepo: Repository<Task>,
        @InjectRepository(Submission) private submissionRepo: Repository<Submission>,
        @InjectRepository(Pregunta) private preguntaRepo: Repository<Pregunta>,
        @InjectRepository(Opcion) private opcionRepo: Repository<Opcion>,
        @InjectRepository(RespuestaAlternativa) private respuestaRepo: Repository<RespuestaAlternativa>,
        private readonly dataSource: DataSource,
    ) { }

    // ── Docente: gestión de tareas ───────────────────────────────

    async getCourseTasks(cursoId: string) {
        return this.taskRepo.find({
            where: { curso_id: cursoId, activo: true },
            order: { fecha_limite: 'ASC' },
        });
    }

    async createTask(cursoId: string, dto: CreateTaskDto) {
        const { preguntas, ...taskData } = dto;

        // Validar que al menos un tipo de entrega esté habilitado
        if (!taskData.permite_alternativas && !taskData.permite_archivo && !taskData.permite_texto) {
            throw new BadRequestException(
                'La tarea debe permitir al menos un tipo de entrega (alternativas, archivo o texto)',
            );
        }

        return this.dataSource.transaction(async (em) => {
            const task = em.create(Task, {
                ...taskData,
                curso_id: cursoId,
                fecha_limite: new Date(dto.fecha_limite),
            });
            await em.save(task);

            // Crear preguntas si la tarea tiene alternativas
            if (taskData.permite_alternativas && preguntas?.length) {
                for (const pDto of preguntas) {
                    const { opciones, ...pData } = pDto;
                    const pregunta = em.create(Pregunta, { ...pData, tarea_id: task.id });
                    await em.save(pregunta);

                    for (const oDto of opciones) {
                        const opcion = em.create(Opcion, { ...oDto, pregunta_id: pregunta.id });
                        await em.save(opcion);
                    }
                }
            }

            return task;
        });
    }

    async getTaskById(taskId: string, incluirPreguntas = false) {
        const task = await this.taskRepo.findOne({
            where: { id: taskId },
            relations: incluirPreguntas ? ['preguntas', 'preguntas.opciones'] : [],
        });
        if (!task) throw new NotFoundException('Tarea no encontrada');
        return task;
    }

    async toggleTask(taskId: string, dto: ToggleTaskDto) {
        const task = await this.taskRepo.findOne({ where: { id: taskId } });
        if (!task) throw new NotFoundException('Tarea no encontrada');
        task.activo = dto.activo;
        return this.taskRepo.save(task);
    }

    // ── Alumno: ver tarea (oculta respuestas correctas si no venció) ──

    async getTaskForAlumno(taskId: string) {
        const task = await this.getTaskById(taskId, true);
        if (!task.activo) throw new ForbiddenException('Esta tarea no está disponible');

        const vencida = new Date() > task.fecha_limite;

        // Si no venció, ocultar es_correcta de cada opción
        if (!vencida && task.preguntas) {
            task.preguntas = task.preguntas.map((p) => ({
                ...p,
                opciones: p.opciones.map(({ es_correcta, ...o }) => o as Opcion),
            }));
        }

        return { ...task, vencida };
    }

    // ── Alumno: entregar archivo o texto ─────────────────────────

    async submitTask(taskId: string, alumnoId: string, dto: SubmitTaskDto) {
        const task = await this.getTaskById(taskId);

        if (!task.activo) {
            throw new ForbiddenException('Esta tarea no está disponible');
        }
        if (new Date() > task.fecha_limite) {
            throw new ForbiddenException('El plazo de entrega ha vencido');
        }
        if (!dto.storage_key && !dto.respuesta_texto) {
            throw new BadRequestException('Debes adjuntar un archivo o escribir una respuesta');
        }
        if (dto.storage_key && !task.permite_archivo) {
            throw new BadRequestException('Esta tarea no acepta archivos');
        }
        if (dto.respuesta_texto && !task.permite_texto) {
            throw new BadRequestException('Esta tarea no acepta respuestas de texto');
        }

        const ahora = new Date();
        const conRetraso = ahora > task.fecha_limite;

        const existing = await this.submissionRepo.findOne({
            where: { tarea_id: taskId, alumno_id: alumnoId },
        });

        if (existing) {
            Object.assign(existing, { ...dto, con_retraso: conRetraso, fecha_entrega: ahora });
            return this.submissionRepo.save(existing);
        }

        const submission = this.submissionRepo.create({
            tarea_id: taskId,
            alumno_id: alumnoId,
            con_retraso: conRetraso,
            ...dto,
        });
        return this.submissionRepo.save(submission);
    }

    // ── Alumno: entregar respuestas de alternativas ───────────────

    async submitAlternativas(taskId: string, alumnoId: string, dto: SubmitAlternativasDto) {
        const task = await this.getTaskById(taskId);

        if (!task.activo) throw new ForbiddenException('Esta tarea no está disponible');
        if (!task.permite_alternativas) throw new BadRequestException('Esta tarea no tiene alternativas');
        if (new Date() > task.fecha_limite) throw new ForbiddenException('El plazo de entrega ha vencido');

        return this.dataSource.transaction(async (em) => {
            // Obtener o crear entrega
            let submission = await em.findOne(Submission, {
                where: { tarea_id: taskId, alumno_id: alumnoId },
            });

            if (!submission) {
                submission = em.create(Submission, {
                    tarea_id: taskId,
                    alumno_id: alumnoId,
                });
                await em.save(submission);
            }

            // Guardar/actualizar cada respuesta (upsert por entrega+pregunta)
            for (const r of dto.respuestas) {
                const existing = await em.findOne(RespuestaAlternativa, {
                    where: { entrega_id: submission.id, pregunta_id: r.pregunta_id },
                });

                if (existing) {
                    existing.opcion_id = r.opcion_id;
                    await em.save(existing);
                } else {
                    const nueva = em.create(RespuestaAlternativa, {
                        entrega_id: submission.id,
                        pregunta_id: r.pregunta_id,
                        opcion_id: r.opcion_id,
                    });
                    await em.save(nueva);
                }
            }

            // Autocorregir: sumar puntos de opciones correctas
            const calificacion_auto = await this.calcularAutoCorreccion(submission.id);
            submission.calificacion_auto = calificacion_auto;
            await em.save(submission);

            return { submission, calificacion_auto };
        });
    }

    // ── Autocorrección ───────────────────────────────────────────

    private async calcularAutoCorreccion(submissionId: string): Promise<number> {
        const resultado = await this.dataSource.query(`
            SELECT COALESCE(SUM(p.puntos), 0) AS total
            FROM respuestas_alternativas ra
            JOIN opciones o  ON o.id  = ra.opcion_id
            JOIN preguntas p ON p.id  = ra.pregunta_id
            WHERE ra.entrega_id = $1
              AND o.es_correcta = true
        `, [submissionId]);

        return parseFloat(resultado[0].total);
    }

    // ── Docente: ver entregas ────────────────────────────────────

    async getSubmissions(taskId: string) {
        return this.submissionRepo.find({
            where: { tarea_id: taskId },
            relations: ['alumno'],
            order: { fecha_entrega: 'ASC' },
        });
    }

    async getSubmissionById(submissionId: string) {
        const s = await this.submissionRepo.findOne({
            where: { id: submissionId },
            relations: ['alumno', 'respuestas', 'respuestas.pregunta', 'respuestas.opcion'],
        });
        if (!s) throw new NotFoundException('Entrega no encontrada');
        return s;
    }

    // ── Docente: calificar archivo/texto manualmente ──────────────

    async gradeSubmission(submissionId: string, dto: GradeTaskDto) {
        const submission = await this.submissionRepo.findOne({
            where: { id: submissionId },
        });
        if (!submission) throw new NotFoundException('Entrega no encontrada');

        submission.calificacion_manual = dto.calificacion_manual;
        submission.comentario_docente = dto.comentario_docente ?? null;

        // calificacion_final = promedio si hay auto + manual, si no, el que exista
        const { calificacion_auto, calificacion_manual } = submission;
        if (calificacion_auto !== null && calificacion_manual !== null) {
            submission.calificacion_final = (Number(calificacion_auto) + Number(calificacion_manual)) / 2;
        } else {
            submission.calificacion_final = calificacion_manual ?? calificacion_auto;
        }

        return this.submissionRepo.save(submission);
    }

    // ── Alumno: ver su propia entrega ────────────────────────────

    async getMySubmission(taskId: string, alumnoId: string) {
        return this.submissionRepo.findOne({
            where: { tarea_id: taskId, alumno_id: alumnoId },
            relations: ['respuestas', 'respuestas.opcion'],
        });
    }
}