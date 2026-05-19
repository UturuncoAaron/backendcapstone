import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PsychologyController } from './psychology.controller.js';
import { PsychologyService } from './psychology.service.js';

import { PsychologyArchivosController } from './archivos/archivos.controller.js';
import { PsychologyArchivosService }    from './archivos/archivos.service.js';

import { PsychologistStudent } from './entities/psychologist-student.entity.js';
import { PsychologyRecord }    from './entities/psychology-record.entity.js';
import { InformePsicologico }  from './entities/informe-psicologico.entity.js';
import { PsychologyArchivo }   from './entities/psychology-archivo.entity.js';
import { Psicologa }           from '../users/entities/psicologa.entity.js';

import { StorageModule } from '../storage/storage.module.js';
import { UsersModule }   from '../users/users.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            PsychologistStudent,
            PsychologyRecord,
            InformePsicologico,
            PsychologyArchivo,
            Psicologa,
        ]),
        StorageModule,
        UsersModule,
    ],
    controllers: [
        PsychologyController,
        PsychologyArchivosController,
    ],
    providers: [
        PsychologyService,
        PsychologyArchivosService,
    ],
    exports: [
        PsychologyService,
        PsychologyArchivosService, 
        TypeOrmModule,
    ],
})
export class PsychologyModule { }