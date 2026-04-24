import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { Course } from './entities/course.entity.js';
import { Enrollment } from './entities/enrollment.entity.js';
import { Schedule } from './entities/schedule.entity.js';
import { Period } from '../academic/entities/period.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([Course, Enrollment, Schedule, Period])],
    controllers: [CoursesController],
    providers: [CoursesService],
    exports: [CoursesService],
})
export class CoursesModule { }