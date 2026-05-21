import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './entities/appointment.entity.js';
import { AppointmentStatusLog } from './entities/appointment-status-log.entity.js';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import { AccountAvailability } from './entities/account-availability.entity.js';
import { PsychologistStudent } from '../psychology/entities/psychologist-student.entity.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentsController } from './appointments.controller.js';
import { PublicAvailabilityController } from './public-availability.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      AppointmentStatusLog,
      Cuenta,
      AccountAvailability,
      PsychologistStudent,
    ]),
  ],
  controllers: [AppointmentsController, PublicAvailabilityController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
