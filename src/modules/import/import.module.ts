import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import { Alumno } from '../users/entities/alumno.entity.js';
import { Matricula } from '../academic/entities/matricula.entity.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Cuenta, Alumno, Matricula]),
        MulterModule.register({ limits: { fileSize: 2 * 1024 * 1024 } }),
    ],
    controllers: [ImportController],
    providers: [ImportService],
})
export class ImportModule { }