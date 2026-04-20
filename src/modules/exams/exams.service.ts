import {
    Injectable, NotFoundException,
    ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exam } from './entities/exam.entity.js';
import { Question } from './entities/question.entity.js';
import { Option } from './entities/option.entity.js';
import { Attempt } from './entities/attempt.entity.js';
import { Answer } from './entities/answer.entity.js';

@Injectable()
export class ExamsService {
    constructor(
        @InjectRepository(Exam) private readonly examRepo: Repository<Exam>,
        @InjectRepository(Question) private readonly questionRepo: Repository<Question>,
        @InjectRepository(Option) private readonly optionRepo: Repository<Option>,
        @InjectRepository(Attempt) private readonly attemptRepo: Repository<Attempt>,
        @InjectRepository(Answer) private readonly answerRepo: Repository<Answer>,
    ) { }

    // ── EXÁMENES ────────────────────────────────────────────────────

    async findByCourse(courseId: string) {
        return this.examRepo.find({
            where: { curso_id: courseId },
            order: { fecha_inicio: 'ASC' },
        });
    }

    async findOne(id: string) {
        const exam = await this.examRepo.findOne({
            where: { id },
            relations: ['preguntas', 'preguntas.opciones'],
            order: { preguntas: { orden: 'ASC' } },
        });
        if (!exam) throw new NotFoundException(`Examen ${id} no encontrado`);
        return exam;
    }

    async create(dto: {
        curso_id: string;
        titulo: string;
        descripcion?: string;
        fecha_inicio: string;
        fecha_fin: string;
        puntos_total?: number;
        preguntas: Array<{
            enunciado: string;
            tipo: string;
            puntos?: number;
            orden?: number;
            opciones: Array<{
                texto: string;
                es_correcta: boolean;
                orden?: number;
            }>;
        }>;
    }) {
        const { preguntas, ...examData } = dto;

        const exam = this.examRepo.create(examData as any);
        const savedExam = await this.examRepo.save(exam) as unknown as Exam;

        for (const [i, pregDto] of preguntas.entries()) {
            const { opciones, ...pregData } = pregDto;
            const pregunta = this.questionRepo.create({
                ...pregData,
                examen_id: savedExam.id,
                orden: pregDto.orden ?? i,
            } as any);
            const savedPregunta = await this.questionRepo.save(pregunta) as unknown as Question;

            for (const [j, optDto] of opciones.entries()) {
                const opcion = this.optionRepo.create({
                    ...optDto,
                    pregunta_id: savedPregunta.id,
                    orden: optDto.orden ?? j,
                });
                await this.optionRepo.save(opcion);
            }
        }

        return this.findOne(savedExam.id);
    }

    async toggleActivo(id: string) {
        const exam = await this.examRepo.findOne({ where: { id } });
        if (!exam) throw new NotFoundException(`Examen ${id} no encontrado`);
        exam.activo = !exam.activo;
        return this.examRepo.save(exam);
    }

    // ── INTENTOS (alumno) ────────────────────────────────────────────

    async startAttempt(examId: string, alumnoId: string) {
        const exam = await this.examRepo.findOne({ where: { id: examId, activo: true } });
        if (!exam) throw new NotFoundException('Examen no disponible');

        const now = new Date();
        if (now < exam.fecha_inicio || now > exam.fecha_fin) {
            throw new BadRequestException('El examen no está en el período permitido');
        }

        const existing = await this.attemptRepo.findOne({
            where: { examen_id: examId, alumno_id: alumnoId },
        });
        if (existing) throw new BadRequestException('Ya tienes un intento para este examen');

        const attempt = this.attemptRepo.create({
            examen_id: examId,
            alumno_id: alumnoId,
            fecha_inicio: new Date(),
        });
        return this.attemptRepo.save(attempt);
    }

    async submitAttempt(
        attemptId: string,
        alumnoId: string,
        respuestas: Array<{ pregunta_id: string; opcion_id: string }>,
    ) {
        const attempt = await this.attemptRepo.findOne({
            where: { id: attemptId, alumno_id: alumnoId, completado: false },
        });
        if (!attempt) throw new NotFoundException('Intento no encontrado o ya completado');

        const exam = await this.findOne(attempt.examen_id);

        let puntaje = 0;

        for (const resp of respuestas) {
            const pregunta = exam.preguntas.find(p => p.id === resp.pregunta_id);
            if (!pregunta) continue;

            const opcionCorrecta = pregunta.opciones.find(o => o.es_correcta);
            const esCorrecta = opcionCorrecta?.id === resp.opcion_id;
            if (esCorrecta) puntaje += pregunta.puntos;

            const answer = this.answerRepo.create({
                intento_id: attemptId,
                pregunta_id: resp.pregunta_id,
                opcion_id: resp.opcion_id,
            });
            await this.answerRepo.save(answer);
        }

        attempt.completado = true;
        attempt.fecha_fin = new Date();
        attempt.puntaje = puntaje;
        return this.attemptRepo.save(attempt);
    }

    async getResults(examId: string) {
        return this.attemptRepo.find({
            where: { examen_id: examId, completado: true },
            relations: ['alumno'],
            order: { puntaje: 'DESC' },
        });
    }

    async getMyAttempt(examId: string, alumnoId: string) {
        return this.attemptRepo.findOne({
            where: { examen_id: examId, alumno_id: alumnoId },
            relations: ['respuestas_alumno'],
        });
    }
}