import {
    Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity.js';
import { Submission } from './entities/submission.entity.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { SubmitTaskDto } from './dto/submit-task.dto.js';
import { GradeTaskDto } from './dto/grade-task.dto.js';

@Injectable()
export class TasksService {
    constructor(
        @InjectRepository(Task)
        private readonly taskRepo: Repository<Task>,
        @InjectRepository(Submission)
        private readonly submissionRepo: Repository<Submission>,
    ) { }

    async getCourseTasks(cursoId: string) {
        return this.taskRepo.find({
            where: { curso_id: cursoId, activo: true },
            order: { fecha_entrega: 'ASC' },
        });
    }

    async createTask(cursoId: string, dto: CreateTaskDto) {
        const task = this.taskRepo.create({
            ...dto,
            curso_id: cursoId,
        });
        return this.taskRepo.save(task);
    }

    async getTaskById(taskId: string) {
        const task = await this.taskRepo.findOne({
            where: { id: taskId, activo: true },
        });
        if (!task) throw new NotFoundException('Tarea no encontrada');
        return task;
    }

    async submitTask(taskId: string, alumnoId: string, dto: SubmitTaskDto) {
        if (!dto.url_archivo && !dto.respuesta_texto) {
            throw new BadRequestException('Debes adjuntar un archivo o escribir una respuesta');
        }

        const task = await this.getTaskById(taskId);
        const ahora = new Date();
        const conRetraso = ahora > new Date(task.fecha_entrega);

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
            ...dto,
            con_retraso: conRetraso,
        });
        return this.submissionRepo.save(submission);
    }

    async getSubmissions(taskId: string) {
        return this.submissionRepo.find({
            where: { tarea_id: taskId },
            relations: ['alumno'],
            order: { fecha_entrega: 'ASC' },
        });
    }

    async gradeSubmission(submissionId: string, dto: GradeTaskDto) {
        const submission = await this.submissionRepo.findOne({
            where: { id: submissionId },
        });
        if (!submission) throw new NotFoundException('Entrega no encontrada');
        Object.assign(submission, dto);
        return this.submissionRepo.save(submission);
    }

    async getMySubmission(taskId: string, alumnoId: string) {
        return this.submissionRepo.findOne({
            where: { tarea_id: taskId, alumno_id: alumnoId },
        });
    }
}