import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { Task } from './entities/task.entity.js';
import { Submission } from './entities/submission.entity.js';
import { Pregunta } from './entities/pregunta.entity.js';
import { Opcion } from './entities/opcion.entity.js';
import { RespuestaAlternativa } from './entities/respuesta-alternativa.entity.js';
import { StorageModule } from '../storage/storage.module.js';
import { SemanasModule } from '../semanas/semanas.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Task,
            Submission,
            Pregunta,
            Opcion,
            RespuestaAlternativa,
        ]),
        StorageModule,
        SemanasModule,
    ],
    controllers: [TasksController],
    providers: [TasksService],
    exports: [TasksService],
})
export class TasksModule { }