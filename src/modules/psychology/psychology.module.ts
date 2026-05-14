import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Psicologa } from '../users/entities/psicologa.entity.js';
import { PsychologistStudent } from './entities/psychologist-student.entity.js';
import { PsychologyRecord } from './entities/psychology-record.entity.js';
import { InformePsicologico } from './entities/informe-psicologico.entity.js';
import { PsychologyService } from './psychology.service.js';
import { PsychologyController } from './psychology.controller.js';
import { PsychologySchemaSync } from './psychology.schema-sync.js';
import { UsersModule } from '../users/users.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Psicologa,
            PsychologistStudent,
            PsychologyRecord,
            InformePsicologico,
        ]),
        UsersModule,
    ],
    controllers: [PsychologyController],
    providers: [PsychologyService, PsychologySchemaSync],
    exports: [PsychologyService],
})
export class PsychologyModule { }