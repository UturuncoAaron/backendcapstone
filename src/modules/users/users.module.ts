import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller.js';
import { ProfileController } from './profile.controller.js';
import { UsersService } from './users.service.js';
import { Cuenta } from './entities/cuenta.entity.js';
import { Alumno } from './entities/alumno.entity.js';
import { Docente } from './entities/docente.entity.js';
import { Padre } from './entities/padre.entity.js';
import { Admin } from './entities/admin.entity.js';
import { Psicologa } from './entities/psicologa.entity.js';
import { Auxiliar } from './entities/auxiliar.entity.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Cuenta, Alumno, Docente, Padre, Admin, Psicologa,Auxiliar]),
        StorageModule,
    ],
    controllers: [UsersController, ProfileController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }