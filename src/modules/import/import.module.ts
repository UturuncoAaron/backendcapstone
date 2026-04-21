import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { User } from '../users/entities/user.entity.js';
import { Matricula } from '../academic/entities/matricula.entity.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([User, Matricula]),
        // Archivos en memoria (no en disco) — máximo 2MB por CSV
        MulterModule.register({ limits: { fileSize: 2 * 1024 * 1024 } }),
    ],
    controllers: [ImportController],
    providers: [ImportService],
})
export class ImportModule { }