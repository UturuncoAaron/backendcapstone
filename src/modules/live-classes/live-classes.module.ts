import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiveClassesController } from './live-classes.controller.js';
import { LiveClassesService } from './live-classes.service.js';
import { LiveClass } from './entities/live-class.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([LiveClass])],
    controllers: [LiveClassesController],
    providers: [LiveClassesService],
    exports: [LiveClassesService],
})
export class LiveClassesModule { }