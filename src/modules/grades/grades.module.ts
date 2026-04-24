import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grade } from './entities/grade.entity.js';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([Grade])],
    controllers: [GradesController],
    providers: [GradesService],
    exports: [GradesService],
})
export class GradesModule { }