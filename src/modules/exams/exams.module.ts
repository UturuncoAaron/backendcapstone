import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';
import { Exam } from './entities/exam.entity.js';
import { Question } from './entities/question.entity.js';
import { Option } from './entities/option.entity.js';
import { Attempt } from './entities/attempt.entity.js';
import { Answer } from './entities/answer.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([Exam, Question, Option, Attempt, Answer])],
    controllers: [ExamsController],
    providers: [ExamsService],
    exports: [ExamsService],
})
export class ExamsModule { }