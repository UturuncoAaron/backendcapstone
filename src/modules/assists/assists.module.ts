import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistsController } from './assists.controller.js';
import { AssistsService } from './assists.service.js';
import { Attendance } from './entities/attendance.entity.js';
import { Course } from '../courses/entities/course.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([Attendance, Course])],
    controllers: [AssistsController],
    providers: [AssistsService],
    exports: [AssistsService],
})
export class AssistsModule { }