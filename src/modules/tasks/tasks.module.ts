import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity.js';
import { Submission } from './entities/submission.entity.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([Task, Submission])],
    controllers: [TasksController],
    providers: [TasksService],
})
export class TasksModule { }