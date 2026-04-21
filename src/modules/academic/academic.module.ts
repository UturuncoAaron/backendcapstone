import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicController } from './academic.controller.js';
import { AcademicService } from './academic.service.js';
import { GradeLevel } from './entities/grade-level.entity.js';
import { Section } from './entities/section.entity.js';
import { Period } from './entities/period.entity.js';
import { CoursesModule } from '../courses/courses.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([GradeLevel, Section, Period]),
        CoursesModule,
    ],
    controllers: [AcademicController],
    providers: [AcademicService],
    exports: [AcademicService],
})
export class AcademicModule { }