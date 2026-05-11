import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './entities/appointment.entity.js';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import { AccountAvailability } from './entities/account-availability.entity.js';
import { PsychologistStudent } from '../psychology/entities/psychologist-student.entity.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsSchemaSync } from './appointments.schema-sync.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      Cuenta,
      AccountAvailability,
      PsychologistStudent,
    ]),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsSchemaSync],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
