import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './entities/appointment.entity.js';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import { PsychologistAvailability } from '../psychology/entities/psychologist-availability.entity.js';
import { PsychologistBlock } from '../psychology/entities/psychologist-block.entity.js';
import { PsychologistStudent } from '../psychology/entities/psychologist-student.entity.js';

import { AppointmentsService } from './appointments.service.js';
import { AppointmentsController } from './appointments.controller.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Appointment,
            Cuenta,
            PsychologistAvailability,
            PsychologistBlock,
            PsychologistStudent,
        ]),
    ],
    controllers: [AppointmentsController],
    providers: [AppointmentsService],
    exports: [AppointmentsService],
})
export class AppointmentsModule { }