import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FichajeController } from './fichaje.controller.js';
import { FichajeService } from './fichaje.service.js';
import { AsistenciaPersonal } from './entities/asistencia-personal.entity.js';
import { HorarioLaboral } from './entities/horario-laboral.entity.js';
import { UsersModule } from '../users/users.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([AsistenciaPersonal, HorarioLaboral]),
        UsersModule,
    ],
    controllers: [FichajeController],
    providers: [FichajeService],
    exports: [FichajeService],
})
export class FichajeModule { }