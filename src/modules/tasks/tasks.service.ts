import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';

import { Task } from './entities/task.entity.js';
import { Submission } from './entities/submission.entity.js';
import { Pregunta } from './entities/pregunta.entity.js';
import { Opcion } from './entities/opcion.entity.js';
import { RespuestaAlternativa } from './entities/respuesta-alternativa.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { SemanasService } from '../semanas/semanas.service.js';

import {
    CreateTaskDto,
    SubmitTaskDto,
    SubmitAlternativasDto,
    GradeTaskDto,
    ToggleTaskDto,
} from './dto/tasks.dto.js';

@Injectable()
export class TasksService {
    constructor(
        @InjectRepository(Task) private taskRepo: Repository<Task>,
        @InjectRepository(Submission)
        private submissionRepo: Repository<Submission>,
        @InjectRepository(Pregunta) private preguntaRepo: Repository<Pregunta>,
        @InjectRepository(Opcion) private opcionRepo: Repository<Opcion>,
        @InjectRepository(RespuestaAlternativa)
        private respuestaRepo: Repository<RespuestaAlternativa>,
        private readonly dataSource: DataSource,
        private readonly storage: StorageService,
        private readonly semanasService: SemanasService,
    ) { }

    // ── Docente: gestión de tareas ───────────────────────────────

    async getCourseTasks(
        cursoId: string,
        incluirInactivas = false,
    ) {
        const where: Record<string, unknown> = { curso_id: cursoId };
        if (!incluirInactivas) where['activo'] = true;
        const tareas = await this.taskRepo.find({
            where,
            order: { fecha_limite: 'ASC' },
        });

        // Cuando incluirInactivas=false (alumnos), también ocultamos las que
        // pertenezcan a una semana marcada como oculta por el docente.
        if (!incluirInactivas) {
            const ocultas = new Set(await this.semanasService.getHiddenSemanas(cursoId));
            return tareas.filter((t) => !(t.semana != null && ocultas.has(t.semana)));
        }
        return tareas;
    }

    async createTask(cursoId: string, dto: CreateTaskDto) {
        const { preguntas, ...taskData } = dto;

        if (
            !taskData.permite_alternativas &&
            !taskData.permite_archivo &&
            !taskData.permite_texto
        ) {
            throw new BadRequestException(
                'La tarea debe permitir al menos un tipo de entrega (alternativas, archivo o texto)',
            );
        }

        return this.dataSource.transaction(async (em) => {
            const task = em.create(Task, {
                ...taskData,
                curso_id: cursoId,
                fecha_limite: new Date(dto.fecha_limite),
                activo: true,
            });
            await em.save(task);

            if (taskData.permite_alternativas && preguntas?.length) {
                for (let pi = 0; pi < preguntas.length; pi++) {
                    const pDto = preguntas[pi];
                    const pregunta = em.create(Pregunta, {
                        tarea_id: task.id,
                        enunciado: pDto.enunciado,
                        puntos: pDto.puntos ?? 1,
                        orden: pDto.orden ?? pi,
                    });
                    await em.save(pregunta);

                    for (let oi = 0; oi < pDto.opciones.length; oi++) {
                        const oDto = pDto.opciones[oi];
                        const opcion = em.create(Opcion, {
                            pregunta_id: pregunta.id,
                            texto: oDto.texto,
                            es_correcta: oDto.es_correcta === true,
                            orden: oDto.orden ?? oi,
                        });
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
        if (!task.activo)
            throw new ForbiddenException('Esta tarea no está disponible');

        const vencida = new Date() > task.fecha_limite;

        if (!vencida && task.preguntas) {
            task.preguntas = task.preguntas.map((p) => ({
                ...p,
                opciones: p.opciones.map((op) => {
                    const { es_correcta: _ec, ...o } = op;
                    return o as Opcion;
                }),
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
            throw new BadRequestException(
                'Debes adjuntar un archivo o escribir una respuesta',
            );
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
            Object.assign(existing, {
                ...dto,
                con_retraso: conRetraso,
                fecha_entrega: ahora,
            });
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

    async submitAlternativas(
        taskId: string,
        alumnoId: string,
        dto: SubmitAlternativasDto,
    ) {
        const task = await this.getTaskById(taskId);

        if (!task.activo)
            throw new ForbiddenException('Esta tarea no está disponible');
        if (!task.permite_alternativas)
            throw new BadRequestException('Esta tarea no tiene alternativas');
        if (new Date() > task.fecha_limite)
            throw new ForbiddenException('El plazo de entrega ha vencido');

        return this.dataSource.transaction(async (em) => {
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

            // ← pasar el EntityManager para que la query vea las filas recién insertadas
            const calificacion_auto = await this.calcularAutoCorreccion(
                submission.id,
                em,
            );
            submission.calificacion_auto = calificacion_auto;
            await em.save(submission);

            return { submission, calificacion_auto };
        });
    }

    // ── Autocorrección ───────────────────────────────────────────

    private async calcularAutoCorreccion(
        submissionId: string,
        em?: EntityManager,
    ): Promise<number> {
        const runner = em ?? this.dataSource.manager;
        const resultado: Array<{ total: string | number }> = await runner.query(
            `
                SELECT COALESCE(SUM(p.puntos), 0) AS total
                FROM respuestas_alternativas ra
                JOIN opciones o  ON o.id  = ra.opcion_id
                JOIN preguntas p ON p.id  = ra.pregunta_id
                WHERE ra.entrega_id = $1
                  AND o.es_correcta = true
            `,
            [submissionId],
        );

        return parseFloat(String(resultado[0]?.total ?? 0));
    }

    // ── Alumno: mis entregas (para pintar estado en la lista) ─────

    async getMySubmissions(alumnoId: string) {
        return this.submissionRepo.find({
            where: { alumno_id: alumnoId },
            order: { fecha_entrega: 'DESC' },
        });
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
            relations: [
                'alumno',
                'respuestas',
                'respuestas.pregunta',
                'respuestas.opcion',
            ],
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

        const { calificacion_auto, calificacion_manual } = submission;
        if (calificacion_auto !== null && calificacion_manual !== null) {
            submission.calificacion_final =
                (Number(calificacion_auto) + Number(calificacion_manual)) / 2;
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

    // ── Docente: adjuntar archivo de enunciado/referencia ─────────

    async attachEnunciado(
        taskId: string,
        file: { buffer: Buffer; originalname: string; mimetype: string },
    ) {
        const task = await this.taskRepo.findOne({ where: { id: taskId } });
        if (!task) throw new NotFoundException('Tarea no encontrada');

        if (task.enunciado_storage_key) {
            await this.storage
                .deleteFile(task.enunciado_storage_key)
                .catch(() => null);
        }

        const key = await this.storage.uploadFile(
            {
                buffer: file.buffer,
                originalname: file.originalname,
                mimetype: file.mimetype,
            },
            `tareas/${task.curso_id}/${task.id}/enunciado`,
        );
        task.enunciado_storage_key = key;
        task.enunciado_url = file.originalname;
        await this.taskRepo.save(task);

        const url = await this.storage.getSignedUrl(key);
        return { task, url, nombre: file.originalname };
    }

    async getEnunciadoUrl(taskId: string) {
        const task = await this.taskRepo.findOne({ where: { id: taskId } });
        if (!task) throw new NotFoundException('Tarea no encontrada');
        if (!task.enunciado_storage_key && task.enunciado_url) {
            return { url: task.enunciado_url, nombre: null };
        }
        if (!task.enunciado_storage_key) {
            throw new NotFoundException('Esta tarea no tiene archivo de referencia');
        }
        const url = await this.storage.getSignedUrl(task.enunciado_storage_key);
        return { url, nombre: task.enunciado_url };
    }

    // ── Alumno: subir archivo como entrega ───────────────────────

    async submitTaskWithFile(
        taskId: string,
        alumnoId: string,
        file: { buffer: Buffer; originalname: string; mimetype: string },
    ) {
        const task = await this.getTaskById(taskId);
        if (!task.activo)
            throw new ForbiddenException('Esta tarea no está disponible');
        if (!task.permite_archivo)
            throw new BadRequestException('Esta tarea no acepta archivos');
        if (new Date() > task.fecha_limite) {
            throw new ForbiddenException('El plazo de entrega ha vencido');
        }

        const existing = await this.submissionRepo.findOne({
            where: { tarea_id: taskId, alumno_id: alumnoId },
        });

        if (existing?.storage_key) {
            await this.storage.deleteFile(existing.storage_key).catch(() => null);
        }

        const key = await this.storage.uploadFile(
            {
                buffer: file.buffer,
                originalname: file.originalname,
                mimetype: file.mimetype,
            },
            `entregas/${task.id}/${alumnoId}`,
        );

        const ahora = new Date();
        const conRetraso = ahora > task.fecha_limite;

        if (existing) {
            existing.storage_key = key;
            existing.nombre_archivo = file.originalname;
            existing.con_retraso = conRetraso;
            existing.fecha_entrega = ahora;
            return this.submissionRepo.save(existing);
        }

        const submission = this.submissionRepo.create({
            tarea_id: taskId,
            alumno_id: alumnoId,
            storage_key: key,
            nombre_archivo: file.originalname,
            con_retraso: conRetraso,
        });
        return this.submissionRepo.save(submission);
    }

    // ── URL firmada del archivo de una entrega ───────────────────

    async getSubmissionFileUrl(submissionId: string) {
        const s = await this.submissionRepo.findOne({
            where: { id: submissionId },
        });
        if (!s) throw new NotFoundException('Entrega no encontrada');
        if (!s.storage_key)
            throw new NotFoundException('Esta entrega no tiene archivo adjunto');
        if (/^https?:\/\//i.test(s.storage_key)) {
            return { url: s.storage_key, nombre: s.nombre_archivo };
        }
        const url = await this.storage.getSignedUrl(s.storage_key);
        return { url, nombre: s.nombre_archivo };
    }
}