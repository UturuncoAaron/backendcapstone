import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistsController } from './assists.controller.js';
import { AssistsService } from './assists.service.js';
import { AttendanceGeneral } from './entities/attendance-general.entity.js';
import { AttendanceClass } from './entities/attendance-class.entity.js';
import { AttendanceDocente } from './entities/attendance-docente.entity.js';
import { QrModule } from '../qr/qr.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            AttendanceGeneral,
            AttendanceClass,
            AttendanceDocente,
        ]),
        QrModule,
    ],
    controllers: [AssistsController],
    providers: [AssistsService],
    exports: [AssistsService],
})
export class AssistsModule { }