import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Psicologa } from '../users/entities/psicologa.entity.js';
import { PsychologistStudent } from './entities/psychologist-student.entity.js';
import { PsychologistAvailability } from './entities/psychologist-availability.entity.js';
import { PsychologistBlock } from './entities/psychologist-block.entity.js';
import { PsychologyRecord } from './entities/psychology-record.entity.js';
import { Appointment } from './entities/appointment.entity.js';

import { PsychologyService } from './psychology.service.js';
import { PsychologyController } from './psychology.controller.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Psicologa,
            PsychologistStudent,
            PsychologistAvailability,
            PsychologistBlock,
            PsychologyRecord,
            Appointment,
        ]),
    ],
    controllers: [PsychologyController],
    providers: [PsychologyService],
    exports: [PsychologyService],
})
export class PsychologyModule { }