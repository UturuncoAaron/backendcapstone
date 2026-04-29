import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SemanaConfig } from './entities/semana-config.entity.js';
import { SemanasController } from './semanas.controller.js';
import { SemanasService } from './semanas.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([SemanaConfig])],
    controllers: [SemanasController],
    providers: [SemanasService],
    exports: [SemanasService],
})
export class SemanasModule { }
